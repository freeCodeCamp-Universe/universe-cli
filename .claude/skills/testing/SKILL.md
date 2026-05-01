---
name: testing
description: Additional guidelines for writing and structuring tests. Use when writing or modifying test files.
---

# Testing

Follow these rules when writing tests. These are generic guidelines. If a language specific guideline (e.g. one from the typescript-test-guidelines skill) conflicts, then follow that instead.

## Definitions

- A unit test aims to check the behaviour of a single module in isolation. Mocks and stubs are used when necessary (e.g. to avoid calling an external service during testing). They should have low fan-out.
- An integration test aims to check how multiple modules interact. It's acceptable to have moderate fan-out, since multiple modules are tested at once.
- An end-to-end (e2e) test aims to test the entire system. If the system interacts with an external service (e.g. calls a remote server) then that should be mocked, but otherwise not. They should have low fan-out since there's a single system under test (SUT). The tests should typically only import fixtures and any tools required to setup the SUT.

## Test pyramid

Prioritize creating unit tests over integration tests over e2e tests. Only create e2e tests if the behaviour cannot be adequately tested with integration or unit tests. Only create integration tests if the behaviour cannot be adequately tested with unit tests.

Ideally projects should have many unit tests, some integration tests and a few e2e tests.

## Magic numbers

- Use sparingly. Prefer named fixtures.
  ```ts
  for(const n = 0; n < MAX_ITERATIONS; n++) // correct
  for(const n = 0; n < 10; n++) // wrong
  ```
- Exceptions: when it's obvious in context.
  ```ts
  expect(emptyArray).toHaveLength(0);
  ```

## Test conventions

- Structure each test with arrange / act / assert, separated by blank lines:

  ```ts
  it("loads level-01 and returns a LevelDefinition with the correct id", () => {
    const loader = new LevelLoader();

    const result = loader.load("level-01");

    expect(result.id).toBe("level-01");
  });
  ```

- Keep the number of assertions/expects low. Ideally one.
- Extract the setup code into before hooks/setup functions to keep the test body focused.

## Long running unit tests

- If the test does not terminate after a minute, kill it and try again.

## Things to avoid

- Avoid testing constants. `expect(SOME_VALUE).toBe(5)` is bad.
- Avoid testing configuration. Configuration should be checked at runtime.
- Do not export module internals just for testing purposes. Focus on testing the module's public api.
- Avoid testing that something doesn't throw. If the code throws, the test will fail anyway, so the assertion is redundant. Instead, check for the expected result or that the expected side effects occurred.

## Titles

- Avoid overly specific titles. For example "Exits when login fails" is preferrable to "Exits 11 when login fails" since the test will assert the exact value, if necessary and having the number appear twice makes it likely that the test and title go out of sync.
