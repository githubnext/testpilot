# TestPilot

TestPilot is a tool for automatically generating unit tests for npm packages
written in JavaScript/TypeScript using a large language model (LLM).

## Background

TestPilot generates tests for a given function `f` by prompting the LLM with a
skeleton of a test for `f`, including information about `f` embedded in code
comments, such as its signature, the body of `f`, and examples usages of `f`
automatically mined from project documentation. The model's response is then
parsed and translated into a runnable unit test. Optionally, the test is run and
if it fails the model is prompted again with additional information about the
failed test, giving it a chance to refine the test.

Unlike other systems for LLM-based test generation, TestPilot does not require
any additional training or reinforcement learning, and no examples of functions
and their associated tests are needed.

A research paper describing TestPilot in detail is available on
[arXiv](https://arxiv.org/abs/2302.06527).

## Requirements

In general, to be able to run TestPilot you need access to a Codex-style LLM
with completion API. Set the `TESTPILOT_LLM_API_ENDPOINT` environment variable to
the URL of the LLM API endpoint you want to use, and
`TESTPILOT_LLM_AUTH_HEADERS` to a JSON object containing the headers you need to
authenticate with the API.

Typical values for these variables might be:

- `TESTPILOT_LLM_API_ENDPOINT='https://api.openai.com/v1/engines/code-cushman-001/completions'`
- `TESTPILOT_LLM_AUTH_HEADERS='{"Authorization": "Bearer <your API key>", "OpenAI-Organization": "<your organization ID>"}'`

Note, however, that you can run TestPilot in reproduction mode without access to
the LLM API where model responses are taken from the output of a previous run;
see below for details.

## Installation

You can install TestPilot from a pre-built package or from source.

### Installing from a pre-built package

TestPilot is a available as a pre-built npm package, though it is not currently
published to the npm registry. You can download a tarball from the repository
and install it in the usual way. Note that this distribution only contains the
core part of TestPilot, not the benchmarking harness.

### Installing from source

The `src/` directory contains the source code for TestPilot, which is written in
TypeScript and gets compiled into the `dist/` directory. Tests are in `test/`;
the `benchmark/` directory contains a benchmarking harness for running TestPilot
on multiple npm packages; and `ql/` contains the CodeQL queries used to analyze
the results.

In the root directory of a checkout of this repository, run `npm build` to
install dependencies and build the package.

You can also use `npm run build:watch` to automatically build anytime you make
changes to the code. Note, however, that this will not automatically install
dependencies, and also will not build the benchmarking harness.

Use `npm run test` to run the tests. For convenience, this will also install
dependencies and run a build.

## Benchmarking

If you install TestPilot from source, you can use the benchmarking harness to
run TestPilot on multiple packages and analyze the results. This is not
currently available if you install TestPilot from a pre-built package.

### Running locally

Basic usage is as follows:

```sh
node benchmark/run.js --outputDir <report_dir> --package <package_dir>
```

This generates tests for all functions exported by the package in
`<package_dir>`, validates them, and writes the results to `<report_dir>`.

Note that this assumes that package dependencies are installed and any build
steps have been run (e.g., using `npm i` and `npm run build`). TestPilot also
relies on `mocha`, so if the package under test does not already depend on it,
you must install it separately, for example using the command `npm i --no-save
mocha`.

### Running on Actions

The `run-experiment.yml` workflow runs an experiment on GitHub Actions,
producing the final report as an artifact you can download. The `results-all`
artifact contains the results of all packages, while the other artifacts contain
the individual results of each package.

### Reproducing results

The results of TestPilot are non-deterministic, so even if you run it from the
same package on the same machine multiple times, you will get different results.
However, the benchmarking harness records enough data to be able to replay a
benchmark run in many cases.

To do this, use the `--api` and `--responses` options to reuse the API listings
and responses from a previous run:

```sh
node benchmark/run.js --outputDir <report_dir> --package <package_dir> --api <api.json> --responses <prompts.json>
```

Note that by default replay will fail if any of the prompts are not found in the
responses file. This typically happens if TestPilot is refining failing tests,
since in this case the prompt to the model depends on the exact failure message,
which can be system-specific (e.g., containing local file-system paths), or
depend on the Node.js version or other factors.

To work around these limitations, you can pass the `--strictResponses false`
flag handle treat missing prompts by treating them as getting no response from
the model. This will not, in general, produce the same results as the initial
run, but suffices in many cases.

### Analyzing results

The CodeQL queries in `ql/queries` can be used to analyze the results of running
an experiment. See `ql/CodeQL.md` for instructions on how to setup CodeQL and
run the queries.

## License

This project is licensed under the terms of the MIT open source license. Please refer to [MIT](./LICENSE.txt) for the full terms.

## Maintainers

- Max Schaefer (@max-schaefer)
- Frank Tip (@franktip)
- Sarah Nadi (@snadi)

## Support

TestPilot is a research prototype and is not officially supported. However, if
you have questions or feedback, please file an issue and we will do our best to
respond.

## Acknowledgement

We thank Aryaz Eghbali (@aryaze) for his work on the initial version of
TestPilot.
