-- HMDB-like Search Engine PostgreSQL Schema
-- Scope:
--   - All Metabolites parsed JSONL.GZ
--   - MS/MS Spectra XML - Predicted parsed JSONL.GZ
--   - MS/MS Spectra XML - Experimental parsed JSONL.GZ
--   - Seeded adduct definitions and precomputed compound adduct m/z values
--
-- Notes:
--   - For large initial imports, consider creating tables first, loading data,
--     then creating indexes afterward for better import performance.
--   - CCS, search history, cosine similarity results, ML scores, and future
--     curated mass-annotation storage are intentionally not included yet.

BEGIN;

-- =============================================================================
-- 1. Utility trigger function
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 2. Import tracking
-- =============================================================================

CREATE TABLE import_batches (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dataset_name TEXT NOT NULL,
    source_filename TEXT,
    hmdb_release_date DATE,
    status TEXT NOT NULL DEFAULT 'running',
    notes TEXT,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (status IN ('running', 'completed', 'failed', 'partial'))
);

CREATE TRIGGER trg_import_batches_updated_at
BEFORE UPDATE ON import_batches
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 3. Compounds from All Metabolites
-- =============================================================================

CREATE TABLE compounds (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_batch_id INTEGER REFERENCES import_batches(id),
    accession TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    chemical_formula TEXT,
    average_molecular_weight DOUBLE PRECISION,
    monoisotopic_molecular_weight DOUBLE PRECISION,
    iupac_name TEXT,
    traditional_iupac TEXT,
    sources_hierarchy JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 4. Source terms
-- =============================================================================

CREATE TABLE source_terms (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 5. Normalized compound source hierarchy
-- =============================================================================

CREATE TABLE compound_sources (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    compound_id INTEGER NOT NULL REFERENCES compounds(id) ON DELETE CASCADE,
    source_term_id INTEGER NOT NULL REFERENCES source_terms(id),
    parent_source_term_id INTEGER REFERENCES source_terms(id),
    level INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate source rows when parent exists.
CREATE UNIQUE INDEX idx_compound_sources_unique_with_parent
ON compound_sources(compound_id, source_term_id, parent_source_term_id, level)
WHERE parent_source_term_id IS NOT NULL;

-- Prevent duplicate source rows when parent is NULL.
CREATE UNIQUE INDEX idx_compound_sources_unique_without_parent
ON compound_sources(compound_id, source_term_id, level)
WHERE parent_source_term_id IS NULL;

-- =============================================================================
-- 6. Seeded adduct definitions
-- =============================================================================

CREATE TABLE adducts (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    label TEXT NOT NULL UNIQUE,
    ion_mode TEXT NOT NULL,
    charge INTEGER NOT NULL,
    mass_multiplier INTEGER NOT NULL DEFAULT 1,
    mass_shift DOUBLE PRECISION NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ion_mode IN ('positive', 'negative')),
    CHECK (charge <> 0),
    CHECK (mass_multiplier > 0)
);

CREATE TRIGGER trg_adducts_updated_at
BEFORE UPDATE ON adducts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Formula used by import/seed pipeline:
-- theoretical_mz = ((monoisotopic_molecular_weight * mass_multiplier) + mass_shift) / abs(charge)

-- =============================================================================
-- 7. Global adduct blacklist
-- =============================================================================

CREATE TABLE adduct_blacklist (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    adduct_id INTEGER NOT NULL REFERENCES adducts(id) ON DELETE CASCADE,
    reason TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (adduct_id)
);

CREATE TRIGGER trg_adduct_blacklist_updated_at
BEFORE UPDATE ON adduct_blacklist
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 8. Precomputed compound/adduct m/z index
-- =============================================================================

CREATE TABLE compound_adducts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    compound_id INTEGER NOT NULL REFERENCES compounds(id) ON DELETE CASCADE,
    adduct_id INTEGER NOT NULL REFERENCES adducts(id) ON DELETE CASCADE,
    theoretical_mz DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (compound_id, adduct_id)
);

-- =============================================================================
-- 9. MS/MS spectra metadata
-- =============================================================================

CREATE TABLE spectra (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_batch_id INTEGER REFERENCES import_batches(id),
    compound_id INTEGER NOT NULL REFERENCES compounds(id) ON DELETE CASCADE,
    hmdb_spectrum_id INTEGER NOT NULL,
    predicted BOOLEAN NOT NULL,
    ionization_mode TEXT,
    polarity TEXT CHECK (
        polarity IS NULL OR polarity IN ('positive', 'negative')
    ),
    instrument_type TEXT,
    collision_energy_voltage DOUBLE PRECISION,
    splash_key TEXT,
    peak_counter INTEGER,
    raw_metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (hmdb_spectrum_id, compound_id)
);

-- raw_metadata should hold extra MS/MS XML-derived metadata, but not peaks.
-- Peaks are stored separately in spectrum_peaks.

-- =============================================================================
-- 10. Normalized MS/MS peaks
-- =============================================================================

CREATE TABLE spectrum_peaks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    spectrum_id INTEGER NOT NULL REFERENCES spectra(id) ON DELETE CASCADE,
    hmdb_peak_id INTEGER,
    hmdb_msms_id INTEGER,
    mass_charge DOUBLE PRECISION NOT NULL,
    raw_intensity DOUBLE PRECISION,
    normalized_intensity DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- normalized_intensity convention:
--   - 0 to 100 scale
--   - base peak = 100.0

-- =============================================================================
-- 11. Practical first-version indexes
-- =============================================================================

-- Compounds
CREATE UNIQUE INDEX idx_compounds_accession
ON compounds(accession);

CREATE INDEX idx_compounds_name
ON compounds(name);

CREATE INDEX idx_compounds_chemical_formula
ON compounds(chemical_formula);

CREATE INDEX idx_compounds_monoisotopic_mass
ON compounds(monoisotopic_molecular_weight);

-- Source terms
CREATE INDEX idx_source_terms_name
ON source_terms(name);

-- Compound sources
CREATE INDEX idx_compound_sources_compound_id
ON compound_sources(compound_id);

CREATE INDEX idx_compound_sources_source_term_id
ON compound_sources(source_term_id);

CREATE INDEX idx_compound_sources_parent_source_term_id
ON compound_sources(parent_source_term_id);

-- Adducts
CREATE UNIQUE INDEX idx_adducts_label
ON adducts(label);

CREATE INDEX idx_adducts_ion_mode
ON adducts(ion_mode);

-- Adduct blacklist
CREATE UNIQUE INDEX idx_adduct_blacklist_adduct_id
ON adduct_blacklist(adduct_id);

-- Compound adducts
CREATE INDEX idx_compound_adducts_theoretical_mz
ON compound_adducts(theoretical_mz);

CREATE INDEX idx_compound_adducts_adduct_mz
ON compound_adducts(adduct_id, theoretical_mz);

CREATE INDEX idx_compound_adducts_compound_id
ON compound_adducts(compound_id);

-- Spectra
CREATE INDEX idx_spectra_compound_id
ON spectra(compound_id);

CREATE INDEX idx_spectra_predicted
ON spectra(predicted);

CREATE INDEX idx_spectra_polarity
ON spectra(polarity);

CREATE INDEX idx_spectra_compound_predicted
ON spectra(compound_id, predicted);

-- Spectrum peaks
CREATE INDEX idx_spectrum_peaks_mass_charge
ON spectrum_peaks(mass_charge);

CREATE INDEX idx_spectrum_peaks_spectrum_id
ON spectrum_peaks(spectrum_id);

CREATE UNIQUE INDEX idx_spectrum_peaks_unique_hmdb_peak
ON spectrum_peaks(spectrum_id, hmdb_peak_id)
WHERE hmdb_peak_id IS NOT NULL;

COMMIT;