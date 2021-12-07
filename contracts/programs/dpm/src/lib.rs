use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod dpm {
    use super::*;
    pub fn initialize(ctx: Context<Initialize>) -> ProgramResult {
        let contract = &mut ctx.accounts.contract;
        contract.bets = 0;

        Ok(())
    }

    pub fn add_bet(ctx: Context<AddBet>) -> ProgramResult {
        let contract = &mut ctx.accounts.contract;
        contract.bets += 1;

        Ok(())
      }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = user, space = 9000)]
    pub contract: Account<'info, Contract>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program <'info, System>,
}

#[derive(Accounts)]
pub struct AddBet<'info> {
  #[account(mut)]
  pub contract: Account<'info, Contract>,
}

#[account]
pub struct Contract {
    pub bets: u64,
}
