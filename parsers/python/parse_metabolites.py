import json
import xml.etree.ElementTree as ET
import gzip  # Built-in compression module

# ==============================================================================
# CONFIGURATION: ADD OR REMOVE FUTURE FIELDS HERE
# ==============================================================================
TARGET_FIELDS = {
    "accession": "accession",
    "name": "name",
    "chemical_formula": "chemical_formula",
    "average_molecular_weight": "average_molecular_weight",

    # HMDB XML appears to use the misspelled tag "monisotopic_molecular_weight".
    # Internally, we normalize the output field name to "monoisotopic_molecular_weight".
    "monisotopic_molecular_weight": "monoisotopic_molecular_weight",

    "traditional_iupac": "traditional_iupac",
    "iupac_name": "iupac_name",
}
# ==============================================================================


def get_local_tag(elem):
    """Safely strips out the namespace prefix.

    Example:
        '{http://hmdb.ca}descendant' -> 'descendant'
    """
    if isinstance(elem.tag, str) and elem.tag.startswith("{"):
        return elem.tag.split("}", 1)[1]
    return str(elem.tag)


def extract_structured_terms(element, parent_term="Source"):
    """Recursively walks down the descendants tree.

    Captures:
        - term
        - level
        - parent_term

    Direct children of Source start at level 1.
    """
    structured_terms = []

    for child_desc in element:
        if get_local_tag(child_desc) == "descendant":
            term_text = ""
            xml_level = None
            nested_container = None

            for sub_child in child_desc:
                tag = get_local_tag(sub_child)

                if tag == "term" and sub_child.text:
                    term_text = sub_child.text.strip()

                elif tag == "level" and sub_child.text:
                    try:
                        xml_level = int(sub_child.text.strip())
                    except ValueError:
                        xml_level = None

                elif tag == "descendants":
                    nested_container = sub_child

            if term_text:
                adjusted_level = xml_level - 2 if xml_level is not None else 1

                structured_terms.append(
                    {
                        "term": term_text,
                        "level": max(1, adjusted_level),
                        "parent_term": parent_term,
                    }
                )

                next_parent_term = term_text
            else:
                next_parent_term = parent_term

            if nested_container is not None:
                deep_terms = extract_structured_terms(
                    nested_container,
                    parent_term=next_parent_term,
                )
                structured_terms.extend(deep_terms)

    return structured_terms


def find_source_hierarchy(ontology_node):
    """Locates the starting <term>Source</term> node inside the ontology."""
    for desc in ontology_node.iter():
        if get_local_tag(desc) == "descendant":
            term_node = None

            for child in desc:
                if get_local_tag(child) == "term":
                    term_node = child
                    break

            if (
                term_node is not None
                and term_node.text
                and term_node.text.strip() == "Source"
            ):
                descendants_container = None

                for child in desc:
                    if get_local_tag(child) == "descendants":
                        descendants_container = child
                        break

                if descendants_container is not None:
                    return extract_structured_terms(
                        descendants_container,
                        parent_term="Source",
                    )

                break

    return []


def parse_large_hmdb_to_gzip_jsonl(xml_filename, gzip_jsonl_filename, limit=0):
    count = 0
    max_limit = float("inf") if limit == 0 else limit
    limit_display = "ALL" if limit == 0 else str(limit)

    with gzip.open(gzip_jsonl_filename, "wt", encoding="utf-8") as jsonl_file:
        context = ET.iterparse(xml_filename, events=("end",))

        print(f"Scanning {xml_filename} for {limit_display} matches...")

        for event, elem in context:
            if get_local_tag(elem) == "metabolite":
                count += 1

                metabolite_data = {}
                ontology_node = None

                for child in elem:
                    tag_name = get_local_tag(child)

                    if tag_name in TARGET_FIELDS:
                        header_name = TARGET_FIELDS[tag_name]
                        metabolite_data[header_name] = (
                            child.text or ""
                        ).strip()

                    elif tag_name == "ontology":
                        ontology_node = child

                # Ensure every configured field exists
                for header_name in TARGET_FIELDS.values():
                    if header_name not in metabolite_data:
                        metabolite_data[header_name] = ""

                source_hierarchy = []

                if ontology_node is not None:
                    source_hierarchy = find_source_hierarchy(ontology_node)

                metabolite_data["sources_hierarchy"] = source_hierarchy

                jsonl_file.write(
                    json.dumps(metabolite_data, ensure_ascii=False) + "\n"
                )

                if count % 100 == 0 or limit != 0:
                    accession = metabolite_data.get("accession", f"Row_{count}")
                    print(
                        f"[{count}/{limit_display}] "
                        f"Extracted & Compressed: {accession}"
                    )

                elem.clear()

                if count >= max_limit:
                    break

        del context

    print(
        f"\nSuccess! Saved data securely into compressed archive "
        f"'{gzip_jsonl_filename}'."
    )


if __name__ == "__main__":
    parse_large_hmdb_to_gzip_jsonl(
        xml_filename=r"C:\Users\Admin\Downloads\hmdb_metabolites\hmdb_metabolites.xml",
        gzip_jsonl_filename="hmdb_metabolite_output.jsonl.gz",
        limit=0,
    )