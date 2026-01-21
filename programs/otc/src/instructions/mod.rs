pub mod add_together;
pub mod create_deal;
pub mod get_counter;
pub mod increment_counter;
pub mod init_counter;

// Re-export account structs and events (not handlers to avoid name conflicts)
pub use add_together::{
    AddTogether, AddTogetherCallback, AddTogetherOutput, InitAddTogetherCompDef, SumEvent,
};
pub use create_deal::{
    CreateDeal, CreateDealCallback, CreateDealOutput, InitCreateDealCompDef,
};
pub use get_counter::{
    CounterValueEvent, GetCounter, GetCounterCallback, GetCounterOutput, InitGetCounterCompDef,
};
pub use increment_counter::{
    IncrementCounter, IncrementCounterCallback, IncrementCounterOutput,
    InitIncrementCounterCompDef,
};
pub use init_counter::{
    InitCounter, InitCounterCallback, InitCounterOutput, InitInitCounterCompDef,
};

// Re-export the hidden __client_accounts_* modules that anchor's #[program] macro expects at crate root
#[doc(hidden)]
pub(crate) use add_together::__client_accounts_add_together;
#[doc(hidden)]
pub(crate) use add_together::__client_accounts_add_together_callback;
#[doc(hidden)]
pub(crate) use add_together::__client_accounts_init_add_together_comp_def;
#[doc(hidden)]
pub(crate) use create_deal::__client_accounts_create_deal;
#[doc(hidden)]
pub(crate) use create_deal::__client_accounts_create_deal_callback;
#[doc(hidden)]
pub(crate) use create_deal::__client_accounts_init_create_deal_comp_def;
#[doc(hidden)]
pub(crate) use get_counter::__client_accounts_get_counter;
#[doc(hidden)]
pub(crate) use get_counter::__client_accounts_get_counter_callback;
#[doc(hidden)]
pub(crate) use get_counter::__client_accounts_init_get_counter_comp_def;
#[doc(hidden)]
pub(crate) use increment_counter::__client_accounts_increment_counter;
#[doc(hidden)]
pub(crate) use increment_counter::__client_accounts_increment_counter_callback;
#[doc(hidden)]
pub(crate) use increment_counter::__client_accounts_init_increment_counter_comp_def;
#[doc(hidden)]
pub(crate) use init_counter::__client_accounts_init_counter;
#[doc(hidden)]
pub(crate) use init_counter::__client_accounts_init_counter_callback;
#[doc(hidden)]
pub(crate) use init_counter::__client_accounts_init_init_counter_comp_def;
