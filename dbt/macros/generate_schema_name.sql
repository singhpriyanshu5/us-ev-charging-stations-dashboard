-- Override dbt's default schema naming so that +schema in dbt_project.yml
-- specifies the ABSOLUTE schema name (raw/curated/analytics) rather than
-- appending a suffix to the target schema.
{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- if custom_schema_name is none -%}
        {{ target.schema }}
    {%- else -%}
        {{ custom_schema_name | trim }}
    {%- endif -%}
{%- endmacro %}
