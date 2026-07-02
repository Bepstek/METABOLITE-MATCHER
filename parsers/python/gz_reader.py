import gzip


def extract_subset_from_gzip(source_gzip, output_filename, num_records_to_extract):
    """
    Reads a master .gz file line-by-line without manual disk extraction
    and saves a set number of lines to a new output file.
    """
    print(f"Opening compressed archive: '{source_gzip}'...")
    print(f"Targeting extraction of exactly {num_records_to_extract} records...")

    count = 0

    # Check if the user wants the small subset file compressed or plain text
    is_output_gzip = output_filename.lower().endswith('.gz')

    # 1. Open the master gzip file in 'rt' (read text) mode
    with gzip.open(source_gzip, "rt", encoding="utf-8") as src_file:

        # 2. Open the destination file handle dynamically based on your naming preference
        out_file = (gzip.open(output_filename, "wt", encoding="utf-8") if is_output_gzip
                    else open(output_filename, "w", encoding="utf-8"))

        with out_file:
            for line in src_file:
                if count >= num_records_to_extract:
                    break

                # Write the raw JSON text string line to our new subset pool
                out_file.write(line)
                count += 1

                if count % 1000 == 0 or count == num_records_to_extract:
                    print(f"   -> Streamed {count} items successfully...")

    print(f"\n✅ Extraction Complete! Saved {count} records into '{output_filename}'.")


# ==============================================================================
# EXECUTION ENTRY
# ==============================================================================
if __name__ == "__main__":
    # Your master compressed file path
    master_gz_file = "hmdb_predicted_msms_spectra.jsonl.gz"

    # Option A: Save as plain text, so you can look inside with a text editor
    test_output_text = "hmdb_predicted_msms_spectra-10.jsonl"
    extract_subset_from_gzip(master_gz_file, test_output_text, num_records_to_extract=10)

    # Option B: Save as a smaller .gz if you want to test compressed database imports
    # test_output_compressed = "msms_sample_500.jsonl.gz"
    # extract_subset_from_gzip(master_gz_file, test_output_compressed, num_records_to_extract=500)
