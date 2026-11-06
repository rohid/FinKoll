import { register } from "../registry";

// The default: no AI backend. The assistant routes return 409 before calling run.
register({
  id: "off",
  configured: () => false,
  run: async () => ({ text: "", drafts: [] }),
});
