import { task } from 'hardhat/config';

type ContractName = 'NFTDescriptor' | 'NounsDescriptor' | 'NounsSeeder' | 'NounsToken';

interface VerifyArgs {
  address: string;
  constructorArguments?: (string | number)[];
  libraries?: Record<string, string>;
}

task('verify-etherscan', 'Verify the Solidity contracts on Etherscan').setAction(async (_, hre) => {
  const contracts: Record<ContractName, VerifyArgs> = {
    NFTDescriptor: {
      address: '0x22FAB7aAdCD6Bc7c2801DF5c87823608e3a8500f',
    },
    NounsDescriptor: {
      address: '0xC1801078B577C7dF4b34853Ec2834ee61EF5Bc61',
      libraries: {
        NFTDescriptor: '0x22FAB7aAdCD6Bc7c2801DF5c87823608e3a8500f',
      },
    },
    NounsSeeder: {
      address: '0xf471077fd111bcCBBe4fa57E212bb5770693267D',
    },
    NounsToken: {
      address: '0xF86696F8051cefA4Bacaba1DE63D7bE58FeC505e',
      constructorArguments: [
        '0x5f2c241092d589af5Dd8c0f3f9663cD91fB62F99',
        '0x016345785d8a0000',
        0,
        700,
        hre.ethers.utils.formatBytes32String(''),
        200,
        '0xc1801078b577c7df4b34853ec2834ee61ef5bc61',
        '0xf471077fd111bcCBBe4fa57E212bb5770693267D',
        '0xa5409ec958c83c3f309868babaca7c86dcb077c1',
      ],
    },
  };
  for (const [name, args] of Object.entries(contracts)) {
    console.log(`verifying ${name}...`);
    try {
      await hre.run('verify:verify', {
        ...args,
      });
    } catch (e) {
      console.error(e);
    }
  }
});
