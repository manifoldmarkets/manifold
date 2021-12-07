const anchor = require('@project-serum/anchor')

const { SystemProgram } = anchor.web3

const main = async () => {
  console.log('🚀 Starting test...')

  const provider = anchor.Provider.env()
  anchor.setProvider(provider)

  const program = anchor.workspace.Dpm

  // Create an account keypair for our program to use.
  const baseAccount = anchor.web3.Keypair.generate()

  const tx = await program.rpc.initialize({
    accounts: {
      contract: baseAccount.publicKey,
      user: provider.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    },
    signers: [baseAccount],
  })

  console.log('📝 Your transaction signature', tx)

  let account = await program.account.contract.fetch(baseAccount.publicKey)
  console.log('👀 Bets Count', account.bets.toString())

  await program.rpc.addBet({
    accounts: {
      contract: baseAccount.publicKey,
    },
  })

  account = await program.account.contract.fetch(baseAccount.publicKey)
  console.log('👀 Bets Count', account.bets.toString())
}

const runMain = async () => {
  try {
    await main()
    process.exit(0)
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

runMain()
