import chai from 'chai';
import { ethers } from 'hardhat';
import { BigNumber as EthersBN, constants } from 'ethers';
import { solidity } from 'ethereum-waffle';
import { NounsDescriptor__factory as NounsDescriptorFactory, NounsToken } from '../typechain';
import { deployNounsToken, populateDescriptor, hashAccount } from './utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { override } from 'prompt';
import { MerkleTree } from 'merkletreejs';
import keccack256 from 'keccak256';

chai.use(solidity);
const { expect } = chai;

describe('NounsToken', () => {
  let nounsToken: NounsToken;
  let deployer: SignerWithAddress;
  let noundersDAO: SignerWithAddress;
  let merkleRecipients: SignerWithAddress[];
  let merkleTree: MerkleTree;
  let snapshotId: number;

  before(async () => {
    [deployer, noundersDAO] = await ethers.getSigners();
    merkleRecipients = (await ethers.getSigners()).slice(2, 52);

    merkleTree = new MerkleTree(merkleRecipients.map(account => hashAccount(account)), keccack256, {sortPairs: true});

    nounsToken = await deployNounsToken(deployer, noundersDAO.address, deployer.address, "0.1", merkleTree.getHexRoot());

    const descriptor = await nounsToken.descriptor();

    await populateDescriptor(NounsDescriptorFactory.connect(descriptor, deployer));
  });

  beforeEach(async () => {
    snapshotId = await ethers.provider.send('evm_snapshot', []);
  });

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshotId]);
  });

  it('should set symbol', async () => {
    expect(await nounsToken.symbol()).to.eq('BUMS');
  });

  it('should set name', async () => {
    expect(await nounsToken.name()).to.eq('BeachBums');
  });

  it('should allow minter to mint a noun to itself', async () => {
    const tx = nounsToken.mint(deployer.address, {value: await nounsToken.mintFee()});
    
    await expect(tx).to.emit(nounsToken, 'NounCreated');
    expect(await nounsToken.ownerOf(0)).to.eq(deployer.address);
  });

  it('should allow merkle drop recipient to public mint a noun to itself', async () => {
    const recipient = merkleRecipients[0];

    await nounsToken.connect(recipient).redeem(recipient.address, merkleTree.getHexProof(hashAccount(recipient)));

    const tx = nounsToken.connect(recipient).mint(recipient.address, {value: await nounsToken.mintFee()});
    
    await expect(tx).to.emit(nounsToken, 'NounCreated');
    expect(await nounsToken.ownerOf(1)).to.eq(recipient.address);
  });

  it('should allow merkle drop recipient to redeem a noun to itself', async () => {
    const recipient = merkleRecipients[0];
    const tx = nounsToken.connect(recipient).redeem(recipient.address, merkleTree.getHexProof(hashAccount(recipient)));
    
    await expect(tx).to.emit(nounsToken, 'NounCreated');
    expect(await nounsToken.ownerOf(0)).to.eq(recipient.address);
  });

  it('should fail to redeem a noun more than once', async () => {
    const recipient = merkleRecipients[0];
    const tx = nounsToken.connect(recipient).redeem(recipient.address, merkleTree.getHexProof(hashAccount(recipient)));
    
    await expect(tx).to.emit(nounsToken, 'NounCreated');
    expect(await nounsToken.ownerOf(0)).to.eq(recipient.address);

    const tx2 = nounsToken.connect(recipient).redeem(recipient.address, merkleTree.getHexProof(hashAccount(recipient)));

    await expect(tx2).to.be.revertedWith("Already claimed")
  });

  it('should fail to mint when not enough fee', async () => {
    await expect(nounsToken.mint(deployer.address)).to.be.revertedWith("Insufficient mint fee");
  });

  // it('should emit two transfer logs on mint', async () => {
  //   const [, , creator, minter] = await ethers.getSigners();

  //   await (await nounsToken.mint(deployer.address)).wait();

  //   await (await nounsToken.setMinter(minter.address)).wait();
  //   await (await nounsToken.transferOwnership(creator.address)).wait();

  //   const tx = nounsToken.connect(minter).mint(minter.address);

  //   await expect(tx)
  //     .to.emit(nounsToken, 'Transfer')
  //     .withArgs(constants.AddressZero, creator.address, 2);
  //   await expect(tx).to.emit(nounsToken, 'Transfer').withArgs(creator.address, minter.address, 2);
  // });

  it('should allow minter to burn a noun', async () => {
    await (await nounsToken.mint(deployer.address, {value: await nounsToken.mintFee()})).wait();

    const tx = nounsToken.burn(0);
    await expect(tx).to.emit(nounsToken, 'NounBurned').withArgs(0);
  });

  describe('contractURI', async () => {
    it('should return correct contractURI', async () => {
      expect(await nounsToken.contractURI()).to.eq(
        'ipfs://QmZi1n79FqWt2tTLwCqiy6nLM6xLGRsEPQ5JmReJQKNNzX',
      );
    });
    it('should allow owner to set contractURI', async () => {
      await nounsToken.setContractURIHash('ABC123');
      expect(await nounsToken.contractURI()).to.eq('ipfs://ABC123');
    });
    it('should not allow non owner to set contractURI', async () => {
      const [, nonOwner] = await ethers.getSigners();
      await expect(nounsToken.connect(nonOwner).setContractURIHash('BAD')).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });
});
