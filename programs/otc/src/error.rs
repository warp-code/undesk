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
    #[msg("Not authorized to perform this action")]
    NotAuthorized,
    #[msg("Deal has not been settled yet")]
    DealNotSettled,
    #[msg("Offer has already been settled")]
    OfferAlreadySettled,
    #[msg("Offer does not belong to this deal")]
    DealMismatch,
}
