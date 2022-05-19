import { task, types } from 'hardhat/config';

task('toggle-mint', 'Toggles the mint')
  .addOptionalParam(
    'nounsToken',
    'The `NounsToken` contract address',
    '0x765d778874E6C29DE633240931A253F89A2534c9',
    types.string,
  )
  .setAction(async ({ mintFee, nounsToken }, { ethers }) => {
    const nounsTokenFactory = await ethers.getContractFactory('NounsToken');
    const nounsTokenContract = nounsTokenFactory.attach(nounsToken);

    const tx = await nounsTokenContract.toggleMint();
    const enabled = await nounsTokenContract.isMintEnabled();

    console.log(`Toggled mint to ${enabled}`);
  });
