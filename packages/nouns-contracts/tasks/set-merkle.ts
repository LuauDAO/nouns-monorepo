import { task, types } from 'hardhat/config';
import recipients from '../files/merkle_recipients.json';
import { MerkleTree } from 'merkletreejs';
import keccack256 from 'keccak256';
import { ethers } from 'hardhat';

task('set-merkle', 'Sets merkle tree and reserve')
  .addOptionalParam(
    'merkleQuantity',
    'Amount of supply to reserve for merkle drop',
    undefined,
    types.int,
  )
  .addOptionalParam(
    'nounsToken',
    'The `NounsToken` contract address',
    '0x765d778874E6C29DE633240931A253F89A2534c9',
    types.string,
  )
  .setAction(async ({ merkleQuantity, nounsToken }, { ethers }) => {
    if((typeof merkleQuantity != 'undefined') && (merkleQuantity < recipients.length)) throw(`Invalid merkle quantity (${merkleQuantity}) is less than merkle recipients (${recipients.length})`)

    const hashAccount = (account: string) => {
      return Buffer.from(ethers.utils.solidityKeccak256(['address'], [account]).slice(2), 'hex');
    }

    const nounsTokenFactory = await ethers.getContractFactory('NounsToken');
    const nounsTokenContract = nounsTokenFactory.attach(nounsToken);

    recipients.map(account => { if(!ethers.utils.isAddress(account)) throw(`Invalid account: ${account}`)});

    const merkleTree = new MerkleTree(recipients.map(account => hashAccount(account)), keccack256, {sortPairs: true});

    const tx = await nounsTokenContract.setRoot(merkleTree.getHexRoot(), merkleQuantity || recipients.length);

    console.log(`Updated merkle root and reserved ${merkleQuantity || recipients.length}`);
  });
