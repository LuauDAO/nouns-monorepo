import { task, types } from 'hardhat/config';

task('set-mint-fee', 'Sets mint fee')
  .addPositionalParam('mintFee', 'MintFee', undefined, types.float)
  .addOptionalParam(
    'nounsToken',
    'The `NounsToken` contract address',
    '0x765d778874E6C29DE633240931A253F89A2534c9',
    types.string,
  )
  .setAction(async ({ mintFee, nounsToken }, { ethers }) => {
    const nounsTokenFactory = await ethers.getContractFactory('NounsToken');
    const nounsTokenContract = nounsTokenFactory.attach(nounsToken);

    const tx = await nounsTokenContract.setMintFee(ethers.utils.parseEther(mintFee.toString()));

    console.log(`Updated mint fee to ${mintFee} ETH: ${tx.hash}`);
  });
