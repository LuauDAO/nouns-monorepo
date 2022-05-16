import chai from 'chai';
import { ethers } from 'hardhat';
import { BigNumber as EthersBN, constants } from 'ethers';
import { solidity } from 'ethereum-waffle';
import { NounsDescriptor__factory as NounsDescriptorFactory, NounsToken, Weth } from '../typechain';
import { deployNounsToken, populateDescriptor, hashAccount, deployWeth } from './utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { override } from 'prompt';
import { MerkleTree } from 'merkletreejs';
import keccack256 from 'keccak256';

chai.use(solidity);
const { expect } = chai;

describe('NounsToken', () => {
  let nounsToken: NounsToken;
  let wethContract: Weth;
  let deployer: SignerWithAddress;
  let admin: SignerWithAddress;
  let mintFee: number;
  let royaltyBasis: number;
  let merkleRecipients: SignerWithAddress[];
  let merkleTree: MerkleTree;
  let merkleQuantity: number;
  let maxSupply: number;
  let snapshotId: number;

  before(async () => {
    [deployer, admin] = await ethers.getSigners();
    merkleRecipients = (await ethers.getSigners()).slice(2, 6);
    merkleQuantity = merkleRecipients.length;
    maxSupply = 20;
    mintFee = 0.1;
    royaltyBasis = 100;

    merkleTree = new MerkleTree(merkleRecipients.map(account => hashAccount(account)), keccack256, {sortPairs: true});

    wethContract = await deployWeth();
    nounsToken = await deployNounsToken(deployer, admin.address, mintFee.toString(), royaltyBasis, maxSupply, merkleTree.getHexRoot(), merkleQuantity);

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

  it('should allow admin to set merkle root', async () => {
    const newMerkleTree = new MerkleTree(merkleRecipients.slice(2).map(account => hashAccount(account)), keccack256, {sortPairs: true})
    let oldRoot = await nounsToken.root();
    await nounsToken.connect(admin).setRoot(newMerkleTree.getHexRoot(), 2);
    let newRoot = await nounsToken.root();
    expect(newRoot).to.not.eq(oldRoot);
    expect(newRoot).to.eq(newMerkleTree.getHexRoot());
  });

  it('should not allow non-admin to set merkle root', async () => {
    const newMerkleTree = new MerkleTree(merkleRecipients.slice(2).map(account => hashAccount(account)), keccack256, {sortPairs: true})
    let [, , non_admin] = await ethers.getSigners();
    const tx = nounsToken.connect(non_admin).setRoot(newMerkleTree.getHexRoot(), 2);
    await expect(tx).to.be.revertedWith('Sender is not the owner or admin')
  });

  it('should allow admin to set mint fee', async () => {
    const tx = await nounsToken.connect(admin).setMintFee(ethers.constants.WeiPerEther.mul(2));
    await expect(await nounsToken.mintFee()).to.eq(ethers.constants.WeiPerEther.mul(2));
  });

  it('should allow owner to withdraw contract balance', async () => {
    await (await nounsToken.mint(deployer.address, {value: await nounsToken.mintFee()})).wait();
    const tx = nounsToken.withdraw();

    await expect(await tx).to.changeEtherBalance(deployer, await nounsToken.mintFee());
  });

  it('should allow owner to withdraw contract weth balance', async () => {
    let [,sender] = await ethers.getSigners();
    await (await (wethContract.connect(sender).deposit({ value: 1 }))).wait();
    await (await wethContract.connect(sender).transfer(nounsToken.address, 1)).wait();

    await expect(await wethContract.balanceOf(deployer.address)).to.eq(0);
    const tx = await nounsToken.withdrawERC20Balance(wethContract.address);

    await expect(await wethContract.balanceOf(deployer.address)).to.eq(1);
  });

  it('should not allow non-owner to withdraw contract balance', async () => {
    await (await nounsToken.mint(deployer.address, {value: await nounsToken.mintFee()})).wait();
    let [, , withdrawer] = await ethers.getSigners();
    const tx = nounsToken.connect(withdrawer).withdraw();

    await expect(tx).to.be.revertedWith('Ownable: caller is not the owner');
  });

  it('should allow to mint a noun to self', async () => {
    const tx = nounsToken.mint(deployer.address, {value: await nounsToken.mintFee()});
    
    await expect(tx).to.emit(nounsToken, 'NounCreated');
    expect(await nounsToken.ownerOf(0)).to.eq(deployer.address);
  });

  it('should not allow to mint a noun to self if disabled', async () => {
    await (await (nounsToken.toggleMint())).wait();
    const tx = nounsToken.mint(deployer.address, {value: await nounsToken.mintFee()});
    
    await expect(tx).to.be.revertedWith('Mint is disabled');
  });

  it('should not allow to exceed max supply with public mint', async () => {
    for(let i = 0; i < maxSupply - merkleQuantity; i++) {
      await (await nounsToken.mint(deployer.address, {value: await nounsToken.mintFee()})).wait();
    }

    expect(await nounsToken.totalSupply()).to.eq(maxSupply - merkleQuantity);

    const tx = nounsToken.mint(deployer.address, {value: await nounsToken.mintFee()});
    
    await expect(tx).to.be.revertedWith('Max supply reached');
  });

  it('should not allow to exceed max supply with batch mint', async () => {
    let [, , minter] = await ethers.getSigners();
    let quantity = maxSupply - merkleQuantity;
    const tx = nounsToken.connect(minter).mintBatch(minter.address, quantity, {value: (await nounsToken.mintFee()).mul(quantity)});
    
    await expect(tx).to.be.revertedWith('Max supply reached');
  });

  it('should not allow to exceed max supply with redeem', async () => {
    for(let i = 0; i < maxSupply - merkleQuantity; i++) {
      await (await nounsToken.mint(deployer.address, {value: await nounsToken.mintFee()})).wait();
    }

    for(let i = 0; i < merkleQuantity; i++) {
      await (await nounsToken.connect(merkleRecipients[i]).redeem(merkleRecipients[i].address, merkleTree.getHexProof(hashAccount(merkleRecipients[i])))).wait();
    }

    // here we expand the merkle drop after the max supply has already been reached
    const newRecipients = (await ethers.getSigners()).slice(2, 8);
    const newMerkleTree = new MerkleTree(newRecipients.map(account => hashAccount(account)), keccack256, {sortPairs: true})
    await (await nounsToken.connect(admin).setRoot(newMerkleTree.getHexRoot(), newRecipients.length)).wait();

    const tx = nounsToken.redeem(newRecipients[newRecipients.length - 1].address, newMerkleTree.getHexProof(hashAccount(newRecipients[newRecipients.length - 1])));
    
    await expect(tx).to.be.revertedWith('Max supply reached');
  });

  it('should allow to mint batch to self', async () => {
    let [, , minter] = await ethers.getSigners();
    let quantity = 10;
    const tx = nounsToken.connect(minter).mintBatch(minter.address, quantity, {value: (await nounsToken.mintFee()).mul(quantity)});

    for (let i = 0; i < quantity; i++) {
      await expect(tx).to.emit(nounsToken, 'Transfer').withArgs(ethers.constants.AddressZero, minter.address, i);
      expect(await nounsToken.ownerOf(i)).to.eq(minter.address);
    }
  });

  it('should allow merkle drop recipient to public mint a noun to itself', async () => {
    const recipient = merkleRecipients[0];

    await (await nounsToken.connect(recipient).redeem(recipient.address, merkleTree.getHexProof(hashAccount(recipient)))).wait();

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

  it('should fail to redeem with invalid proof', async () => {
    const recipient = merkleRecipients[0];
    const newMerkleTree = new MerkleTree(merkleRecipients.slice(-2).map(account => hashAccount(account)), keccack256, {sortPairs: true});
    const tx = nounsToken.connect(recipient).redeem(recipient.address, newMerkleTree.getHexProof(hashAccount(recipient)));

    await expect(tx).to.be.revertedWith("Invalid proof")
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

  it('should allow updated merkle drop recipient to redeem a noun to itself', async () => {
    const newRecipients = (await ethers.getSigners()).slice(6, 10);
    const recipient = newRecipients[0];
    const newMerkleTree = new MerkleTree(newRecipients.map(account => hashAccount(account)), keccack256, {sortPairs: true});

    const tx = nounsToken.connect(recipient).redeem(recipient.address, newMerkleTree.getHexProof(hashAccount(recipient)));

    await expect(tx).to.be.revertedWith('Invalid proof');

    await (await nounsToken.connect(admin).setRoot(newMerkleTree.getHexRoot(), newRecipients.length)).wait();

    const tx2 = nounsToken.connect(recipient).redeem(recipient.address, newMerkleTree.getHexProof(hashAccount(recipient)));
    
    await expect(tx2).to.emit(nounsToken, 'NounCreated');
    expect(await nounsToken.ownerOf(0)).to.eq(recipient.address);
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
