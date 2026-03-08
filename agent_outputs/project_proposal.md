# Project Proposal: EV Charging Infrastructure & Adoption Analytics

## Abstract

As electric vehicle adoption accelerates across the United States, a critical question emerges: is the charging infrastructure keeping pace? This project builds an end-to-end data analytics pipeline to analyze the volume and geographic density of EV charging stations across US cities and states, and cross-references that data against state-level EV registration counts to surface infrastructure gaps. We combine three data sources: the NREL Alternative Fuels Station API (real-time, pulled daily) for current station inventory, the DOE/AFDC historical EV registration dataset (archive, 2016–present) for state-level adoption trends, and the US Census Bureau ACS5 API for state population figures used to normalize metrics on a per-capita basis. Raw data is ingested into Snowflake (RAW schema), cleaned and standardized via dbt (CURATED schema), and aggregated into analytical models (ANALYTICS schema) that power a Preset.io dashboard. Key metrics include stations per 100,000 residents, EVs-per-station ratios by state, and city-level station concentration — enabling policymakers, urban planners, and consumers to identify which regions are underserved relative to their EV adoption levels.

---

## Dataset Links and Descriptions

### Dataset 1: NREL Alternative Fuels Station API (Real-time)
- **Link**: https://developer.nrel.gov/api/alt-fuel-stations/v1.json
- **Registration**: Free API key at https://developer.nrel.gov/signup/
- **Description**: Maintained by the US Department of Energy's National Renewable Energy Laboratory, this API provides a live, regularly updated inventory of all alternative fuel stations in the US. Filtered to `fuel_type=ELEC`, it returns ~65,000+ EV charging locations with fields including station name, city, state, ZIP, coordinates, connector types, Level 1/Level 2/DC Fast Charger port counts, operational status, and open date. The underlying dataset is refreshed daily by NREL — networked stations (ChargePoint, EVgo, Blink, etc.) are auto-imported from charging network partners, while non-networked stations are maintained manually. A dedicated `last-updated` endpoint (`/v1/last-updated.json`) allows the pipeline to check whether data has actually changed before triggering a full pull. This serves as the **real-time data source**, pulled daily via Airflow.

### Dataset 2: DOE/AFDC State EV Registration Data (Historical Archive)
- **Link**: https://afdc.energy.gov/vehicle-registration
- **Backup/Alternative**: https://www.atlasevhub.com/materials/state-ev-registration-data/
- **Description**: Published by the US Department of Energy's Alternative Fuels Data Center, this dataset contains annual EV registration counts broken down by state and vehicle type (BEV and PHEV) from 2016 to present. It is available as downloadable CSVs and provides the historical longitudinal view of EV adoption across all 50 states. This serves as the **historical archive source**, loaded once and refreshed annually.

### Dataset 3: US Census Bureau ACS5 API (Population Reference)
- **Link**: https://api.census.gov/data/{year}/acs/acs5?get=NAME,B01003_001E&for=state:*
- **Registration**: No API key required for basic access
- **Description**: The American Community Survey 5-Year Estimates from the US Census Bureau provides state-level population figures. This dataset is used exclusively as a denominator to compute per-capita density metrics (e.g., stations per 100k residents, EVs per 100k residents), enabling fair comparisons across states of different sizes.

---

## Reference Links

- NREL AFDC Developer Docs: https://developer.nrel.gov/docs/transportation/alt-fuel-stations-v1/
- DOE EV Registrations by State: https://afdc.energy.gov/vehicle-registration
- US Census Bureau API Guide: https://www.census.gov/data/developers/guidance/api-user-guide.html
