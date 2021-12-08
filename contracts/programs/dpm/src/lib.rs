use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod dpm {
    use super::*;

    pub fn create_contract(ctx: Context<CreateContract>, props: NewContractProps) -> ProgramResult {
        let contract = &mut ctx.accounts.contract;

        Ok(())
    }

    pub fn place_bet(ctx: Context<PlaceBet>, props: BetProps) -> ProgramResult {
        Ok(())
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct NewContractProps {
    pub id: String,
    pub creator_id: String,
    pub question: String,
    pub description: String,
    pub seed_amounts: SeedAmounts,
}

#[derive(Accounts)]
pub struct CreateContract<'info> {
    #[account(init, payer = creator, space = 9000)]
    pub contract: Account<'info, Contract>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct BetProps {
    pub amount: u64,
    pub user_id: String,
    pub outcome: BetOutcome,
}

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub contract: Account<'info, Contract>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub enum BetOutcome {
    Yes,
    No,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub enum ResolutionOutcome {
    Yes,
    No,
    Cancel,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct SeedAmounts {
    yes: u64,
    no: u64,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct Resolution {
    time: u64,
    outcome: ResolutionOutcome,
}

#[account]
pub struct Contract {
    pub id: String,
    pub creator_id: String,
    pub question: String,
    pub description: String,
    pub seed_amounts: SeedAmounts,

    pub created_time: u64,
    pub last_updated_time: u64,

    pub resolution: Option<Resolution>

    // pub bets: Vec<Bet>
}
