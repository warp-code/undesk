import {
  getTestHarness,
  initAddTogetherCompDef,
  initInitCounterCompDef,
  initIncrementCounterCompDef,
  initGetCounterCompDef,
  initCreateDealCompDef,
  initSubmitOfferCompDef,
  initCrankDealCompDef,
  initCrankOfferCompDef,
} from "./harness";

describe("OTC Setup", () => {
  const { program, provider, owner } = getTestHarness();

  it("initializes add_together comp def", async () => {
    console.log("Initializing add together computation definition");
    const sig = await initAddTogetherCompDef(program, provider, owner, false, false);
    console.log(
      "Add Together computation definition initialized with signature",
      sig
    );
  });

  it("initializes init_counter comp def", async () => {
    const sig = await initInitCounterCompDef(program, provider, owner, false, false);
    console.log(
      "Init Counter computation definition initialized with signature",
      sig
    );
  });

  it("initializes increment_counter comp def", async () => {
    const sig = await initIncrementCounterCompDef(program, provider, owner, false, false);
    console.log(
      "Increment Counter computation definition initialized with signature",
      sig
    );
  });

  it("initializes get_counter comp def", async () => {
    const sig = await initGetCounterCompDef(program, provider, owner, false, false);
    console.log(
      "Get Counter computation definition initialized with signature",
      sig
    );
  });

  it("initializes create_deal comp def", async () => {
    const sig = await initCreateDealCompDef(program, provider, owner, false, false);
    console.log(
      "Create Deal computation definition initialized with signature",
      sig
    );
  });

  it("initializes submit_offer comp def", async () => {
    const sig = await initSubmitOfferCompDef(program, provider, owner, false, false);
    console.log(
      "Submit Offer computation definition initialized with signature",
      sig
    );
  });

  it("initializes crank_deal comp def", async () => {
    const sig = await initCrankDealCompDef(program, provider, owner, false, false);
    console.log(
      "Crank Deal computation definition initialized with signature",
      sig
    );
  });

  it("initializes crank_offer comp def", async () => {
    const sig = await initCrankOfferCompDef(program, provider, owner, false, false);
    console.log(
      "Crank Offer computation definition initialized with signature",
      sig
    );
  });
});
