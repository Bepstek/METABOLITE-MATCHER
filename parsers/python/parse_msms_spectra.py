import json
import xml.etree.ElementTree as ET
import zipfile
import gzip
import os


TARGET_METADATA_FIELDS = {
    "id": "spectrum_id",
    "database-id": "compound_accession",
    "collision-energy-voltage": "collision_energy_voltage",
    "collision-energy-level": "collision_energy_level",
    "energy-field": "energy_field",
    "ionization-mode": "ionization_mode",
    "instrument-type": "instrument_type",
    "splash-key": "splash_key",
    "predicted": "predicted",
    "structure-id": "structure_id",
    "peak-counter": "peak_counter",
    "mono-mass": "mono_mass",
    "chromatography-type": "chromatography_type",
    "analyzer-type": "analyzer_type",
    "ionization-type": "ionization_type",
    "charge-type": "charge_type",
    "data-source": "data_source",
    "data-source-id": "data_source_id",
    "adduct": "adduct",
    "adduct-type": "adduct_type",
    "adduct-mass": "adduct_mass",
    "created-at": "created_at",
    "updated-at": "updated_at",
}


def get_local_tag(elem):
    """Strips namespace prefixes from XML tags."""
    if isinstance(elem.tag, str) and elem.tag.startswith("{"):
        return elem.tag.split("}", 1)[1]
    return str(elem.tag)


def clean_text(elem):
    """Returns stripped text unless the XML node is nil or empty."""
    if elem is None:
        return None

    # Handles attributes like nil="true"
    nil_value = elem.attrib.get("nil")
    if nil_value and nil_value.lower() == "true":
        return None

    text = elem.text
    if text is None:
        return None

    text = text.strip()
    return text if text else None


def safe_float(value):
    if value is None:
        return None

    try:
        return float(str(value).strip())
    except ValueError:
        return None


def safe_int(value):
    if value is None:
        return None

    try:
        return int(str(value).strip())
    except ValueError:
        return None


def safe_bool(value):
    if value is None:
        return None

    value = str(value).strip().lower()

    if value == "true":
        return True

    if value == "false":
        return False

    return None


def normalize_polarity(ionization_mode):
    if not ionization_mode:
        return None

    value = ionization_mode.strip().lower()

    if value in {"positive", "pos", "+"}:
        return "positive"

    if value in {"negative", "neg", "-"}:
        return "negative"

    return None


def parse_single_msms_stream(xml_file_stream):
    """
    Parses one HMDB MS-MS XML file.

    Important:
    - Only direct children of <ms-ms> are treated as spectrum metadata.
    - Nested <reference><id> and <reference><database-id> are ignored
      unless you later decide to parse references separately.
    - Peak data is parsed from <ms-ms-peak> nodes.
    """

    spectrum_data = {}
    peaks_list = []

    context = ET.iterparse(xml_file_stream, events=("start", "end"))

    # Tracks current XML path, e.g.
    # ["ms-ms", "references", "reference", "id"]
    path = []

    for event, elem in context:
        tag_name = get_local_tag(elem)

        if event == "start":
            path.append(tag_name)
            continue

        # ------------------------------------------------------------
        # 1. Direct metadata under <ms-ms>
        # Example path:
        # ["ms-ms", "id"]
        # ["ms-ms", "database-id"]
        # ------------------------------------------------------------
        if len(path) == 2 and path[0] == "ms-ms":
            if tag_name in TARGET_METADATA_FIELDS:
                clean_key = TARGET_METADATA_FIELDS[tag_name]
                value = clean_text(elem)

                if clean_key in {
                    "collision_energy_voltage",
                    "collision_energy_level",
                    "energy_field",
                    "mono_mass",
                    "adduct_mass",
                }:
                    spectrum_data[clean_key] = safe_float(value)

                elif clean_key in {
                    "spectrum_id",
                    "structure_id",
                    "peak_counter",
                }:
                    spectrum_data[clean_key] = safe_int(value)

                elif clean_key == "predicted":
                    spectrum_data[clean_key] = safe_bool(value)

                else:
                    spectrum_data[clean_key] = value

        # ------------------------------------------------------------
        # 2. Peak parsing
        # Example path:
        # ["ms-ms", "ms-ms-peaks", "ms-ms-peak"]
        # ------------------------------------------------------------
        elif (
            len(path) == 3
            and path[0] == "ms-ms"
            and path[1] == "ms-ms-peaks"
            and path[2] == "ms-ms-peak"
            and tag_name == "ms-ms-peak"
        ):
            peak_id = None
            msms_id = None
            mz = None
            intensity = None
            molecule_id = None

            for child in elem:
                child_tag = get_local_tag(child)
                value = clean_text(child)

                if child_tag == "id":
                    peak_id = safe_int(value)

                elif child_tag == "ms-ms-id":
                    msms_id = safe_int(value)

                elif child_tag == "mass-charge":
                    mz = safe_float(value)

                elif child_tag == "intensity":
                    intensity = safe_float(value)

                elif child_tag == "molecule-id":
                    molecule_id = safe_int(value)

            if mz is not None and intensity is not None:
                peaks_list.append(
                    {
                        "peak_id": peak_id,
                        "msms_id": msms_id,
                        "mass_charge": mz,
                        "raw_intensity": intensity,
                        "molecule_id": molecule_id,
                    }
                )

            elem.clear()

        # ------------------------------------------------------------
        # 3. Done with root
        # ------------------------------------------------------------
        if tag_name == "ms-ms":
            elem.clear()

        if path:
            path.pop()

    del context

    if not peaks_list:
        return None

    max_intensity = max(p["raw_intensity"] for p in peaks_list)

    for p in peaks_list:
        if max_intensity > 0:
            p["normalized_intensity"] = round(
                (p["raw_intensity"] / max_intensity) * 100,
                4,
            )
        else:
            p["normalized_intensity"] = 0.0

    ionization_mode = spectrum_data.get("ionization_mode")

    spectrum_data["polarity"] = normalize_polarity(ionization_mode)
    spectrum_data["peaks"] = peaks_list

    return spectrum_data


def process_zipped_spectra_to_gzip_jsonl(
    zip_filepath,
    gzip_jsonl_filename,
    limit=0,
):
    """
    Loops over all XML files in a ZIP archive and writes parsed spectra
    into compressed JSONL.

    source_type can be:
    - "experimental"
    - "predicted"
    """

    count = 0
    max_limit = float("inf") if limit == 0 else limit
    limit_display = "ALL" if limit == 0 else str(limit)

    print(f"Reading ZIP archive: {zip_filepath}...")

    with gzip.open(gzip_jsonl_filename, "wt", encoding="utf-8") as jsonl_file:
        with zipfile.ZipFile(zip_filepath, "r") as z:
            all_files = [
                f for f in z.namelist()
                if f.lower().endswith(".xml")
            ]

            print(
                f"Found {len(all_files)} XML files. "
                f"Bundling into '{gzip_jsonl_filename}'..."
            )

            for file_path in all_files:
                if count >= max_limit:
                    break

                with z.open(file_path) as xml_stream:
                    try:
                        result = parse_single_msms_stream(
                            xml_stream
                        )

                        if result:
                            jsonl_file.write(
                                json.dumps(result, ensure_ascii=False) + "\n"
                            )
                            count += 1

                            if count % 5000 == 0 or limit != 0:
                                spectrum_id = result.get(
                                    "spectrum_id",
                                    f"File_{count}",
                                )
                                print(
                                    f"[{count}/{limit_display}] "
                                    f"Streaming & compressing spectrum: "
                                    f"{spectrum_id}"
                                )

                    except Exception as e:
                        print(f"⚠️ Error parsing file {file_path}: {e}")

    print(
        f"\n✅ Success! Saved {count} compressed spectral entries "
        f"directly into '{gzip_jsonl_filename}'."
    )


# if __name__ == "__main__":
#     zip_path = r"C:\Users\Admin\Downloads\hmdb_experimental_msms_spectra.zip"
#     output_path = "hmdb_experimental_msms_spectra.jsonl.gz"
#
#     process_zipped_spectra_to_gzip_jsonl(
#         zip_filepath=zip_path,
#         gzip_jsonl_filename=output_path,
#         limit=0,
#     )

if __name__ == "__main__":
    zip_path = r"C:\Users\Admin\Downloads\hmdb_predicted_msms_spectra.zip"
    output_path = "hmdb_predicted_msms_spectra.jsonl.gz"

    process_zipped_spectra_to_gzip_jsonl(
        zip_filepath=zip_path,
        gzip_jsonl_filename=output_path,
        limit=0,
    )