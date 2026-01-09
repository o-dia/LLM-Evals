process.env.NODE_ENV = "test";
process.env.DB_NAME = process.env.DB_TEST_NAME ?? "llm_evals_test";
process.env.DB_SSL = process.env.DB_SSL ?? "false";
process.env.POLICY_ENFORCEMENT = process.env.POLICY_ENFORCEMENT ?? "block";
