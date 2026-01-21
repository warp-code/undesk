use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("The computation was aborted")]
    AbortedComputation,
    #[msg("Cluster not set")]
    ClusterNotSet,
    #[msg("Deal is not open")]
    DealNotOpen,
    #[msg("Deal has expired")]
    DealExpired,
}
