import { task, types } from 'hardhat/config';
import { Interface } from 'ethers/lib/utils';
import { Contract as EthersContract } from 'ethers';

type ContractName =
  | 'WETH'
  | 'NFTDescriptor'
  | 'NounsDescriptor'
  | 'NounsSeeder'
  | 'NounsToken';

interface Contract {
  args?: (string | number | (() => string | undefined))[];
  instance?: EthersContract;
  libraries?: () => Record<string, string>;
  waitForConfirmation?: boolean;
}

task('deploy-local', 'Deploy contracts to hardhat')
  .addOptionalParam('mintFee', 'Mint Fee')
  .addOptionalParam('royaltyBasis', 'Royalty basis')
  .addOptionalParam('maxSupply', 'Max supply')
  .addOptionalParam('merkleQuantity', 'Quantity reserved for merkle drop')
  .setAction(async (args, { ethers }) => {
    const network = await ethers.provider.getNetwork();
    if (network.chainId !== 31337) {
      console.log(`Invalid chain id. Expected 31337. Got: ${network.chainId}.`);
      return;
    }

    const proxyRegistryAddress = '0xa5409ec958c83c3f309868babaca7c86dcb077c1';

    const [deployer] = await ethers.getSigners();
    const nonce = await deployer.getTransactionCount();
    const contracts: Record<ContractName, Contract> = {
      WETH: {},
      NFTDescriptor: {},
      NounsDescriptor: {
        libraries: () => ({
          NFTDescriptor: contracts['NFTDescriptor'].instance?.address as string,
        }),
      },
      NounsSeeder: {},
      NounsToken: {
        args: [
          deployer.address,
          ethers.utils.parseEther(args.mintFee || "0.1"),
          args.royaltyBasis || 0,
          args.maxSupply || 700,
          ethers.utils.formatBytes32String(""),
          args.merkleQuantity || 0,
          () => contracts['NounsDescriptor'].instance?.address,
          () => contracts['NounsSeeder'].instance?.address,
          proxyRegistryAddress,
        ],
      },
    };

    for (const [name, contract] of Object.entries(contracts)) {
      const factory = await ethers.getContractFactory(name, {
        libraries: contract?.libraries?.(),
      });

      const deployedContract = await factory.deploy(
        ...(contract.args?.map(a => (typeof a === 'function' ? a() : a)) ?? []),
      );

      if (contract.waitForConfirmation) {
        await deployedContract.deployed();
      }

      contracts[name as ContractName].instance = deployedContract;

      console.log(`${name} contract deployed to ${deployedContract.address}`);
    }

    return contracts;
  });
