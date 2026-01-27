import {
  getTestHarness,
  initCompDefIfNeeded,
  initAddTogetherCompDef,
  initInitCounterCompDef,
  initIncrementCounterCompDef,
  initGetCounterCompDef,
  initCreateDealCompDef,
  initSubmitOfferCompDef,
  initCrankDealCompDef,
  initCrankOfferCompDef,
} from "./harness";
import { setupTestMints } from "./setup-mints";

describe("OTC Setup", () => {
  const { program, provider, owner } = getTestHarness();

  it("creates test mints", async () => {
    const mints = await setupTestMints();
    console.log("Test mints created:", mints);
  });

  it("initializes add_together comp def", async () => {
    await initCompDefIfNeeded(
      () => initAddTogetherCompDef(program, provider, owner, false, false),
      "Add Together"
    );
  });

  it("initializes init_counter comp def", async () => {
    await initCompDefIfNeeded(
      () => initInitCounterCompDef(program, provider, owner, false, false),
      "Init Counter"
    );
  });

  it("initializes increment_counter comp def", async () => {
    await initCompDefIfNeeded(
      () => initIncrementCounterCompDef(program, provider, owner, false, false),
      "Increment Counter"
    );
  });

  it("initializes get_counter comp def", async () => {
    await initCompDefIfNeeded(
      () => initGetCounterCompDef(program, provider, owner, false, false),
      "Get Counter"
    );
  });

  it("initializes create_deal comp def", async () => {
    await initCompDefIfNeeded(
      () => initCreateDealCompDef(program, provider, owner, false, false),
      "Create Deal"
    );
  });

  it("initializes submit_offer comp def", async () => {
    await initCompDefIfNeeded(
      () => initSubmitOfferCompDef(program, provider, owner, false, false),
      "Submit Offer"
    );
  });

  it("initializes crank_deal comp def", async () => {
    await initCompDefIfNeeded(
      () => initCrankDealCompDef(program, provider, owner, false, false),
      "Crank Deal"
    );
  });

  it("initializes crank_offer comp def", async () => {
    await initCompDefIfNeeded(
      () => initCrankOfferCompDef(program, provider, owner, false, false),
      "Crank Offer"
    );
  });
});
