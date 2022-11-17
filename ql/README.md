# Setting up and using CodeQL

## Installation

Install the CodeQL CLI as described in the [documentation](https://docs.github.com/en/code-security/codeql-cli/getting-started-with-the-codeql-cli/setting-up-the-codeql-cli).

In this directory, run `codeql pack install` to install the CodeQL libraries for JavaScript.

## Analyzing the results of a benchmark run

To analyze the results of a benchmark run, download the artifacts to some directory `$artifact_dir`, and then run the following command to build a database from the results in `$dbdir`:

```sh
LGTM_INDEX_FILTERS='include:**/*.json
    exclude:**/coverageData/**/*.json' codeql database create --overwrite -l javascript --source-root $artifact_dir -- $dbdir
```

(Note that the environment variable `LGTM_INDEX_FILTERS` has to be set exactly as shown, with a _newline_ in between the `include:` and `exclude:` lines. Otherwise database creation will fail or result in an empty database.)

If the artifacts contain very large (>10MB) JSON files, those files will be skipped by default. To include them in the database, set the environment variable `LGTM_MAX_FILE_SIZE` to a larger value, such as `100MB`.

You can use either the CodeQL CLI or the CodeQL extension for VSCode to analyze the resulting database, using the queries in this repository.
