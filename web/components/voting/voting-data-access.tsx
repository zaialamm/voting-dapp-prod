'use client';

import { getVotingProgram, getVotingProgramId } from '@voting-dapp/anchor';
import { Program, BN } from '@coral-xyz/anchor';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Cluster, ComputeBudgetProgram, PublicKey, Transaction } from '@solana/web3.js';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import toast from 'react-hot-toast';
import { useCluster } from '../cluster/cluster-data-access';
import { useAnchorProvider } from '../solana/solana-provider';
import { useTransactionToast } from '../ui/ui-layout';


export function useVotingProgramCandidateAccount({ account }: { account: PublicKey }) {
  const { cluster } = useCluster();
  const provider = useAnchorProvider();
  const program = getVotingProgram(provider);
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const transactionToast = useTransactionToast();

  const candidateQuery = useQuery({
    queryKey: ['candidate', { cluster, account }],
    queryFn: () => program.account.candidate.fetch(account),
  });

  const vote = useMutation({
    mutationKey: ['voting', 'vote', { cluster }],
    mutationFn: async (candidate: string) => {

      // request a specific compute unit budget
      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: 8000,
      });

      // get minimal priority fee value
      const recentPriorityFees = await connection.getRecentPrioritizationFees();
      const minFee = Math.min(...recentPriorityFees.map(fee => fee.prioritizationFee));

      // set priority fee
      const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1,
      });

      const vote = await program.methods.vote(
        candidate,
        new BN(1),
      ).instruction();

      // Fetch the latest blockhash and last valid block height
      const blockhashContext = await connection.getLatestBlockhashAndContext();

      const transaction = new Transaction(
        {
          feePayer: publicKey,
          blockhash: blockhashContext.value.blockhash,
          lastValidBlockHeight: blockhashContext.value.lastValidBlockHeight,
      })
        .add(modifyComputeUnits)
        .add(addPriorityFee)
        .add(vote);

      return await sendTransaction(transaction, connection);
    },
      onSuccess: (signature) => {
        transactionToast(signature);
        return candidateQuery.refetch();
      },
      onError: () => toast.error('Failed to vote for candidate'),
  });

  return {
    candidateQuery,
    vote
  }
}

export function useVotingProgram() {
  const { connection } = useConnection();
  const { cluster } = useCluster();
  const transactionToast = useTransactionToast();
  const provider = useAnchorProvider();
  const programId = useMemo(
    () => getVotingProgramId(cluster.network as Cluster),
    [cluster]
  );
  const program = getVotingProgram(provider);

  const accounts = useQuery({
    queryKey: ['voting', 'all', { cluster }],
    queryFn: () => program.account.candidate.all(),
  });

  const polls = useQuery({
    queryKey: ['polls', 'all', { cluster }],
    queryFn: () => program.account.poll.all(),
  });

  const candidates = useQuery({
    queryKey: ['candidates', 'all', { cluster }],
    queryFn: () => program.account.candidate.all(),
  });

  const getProgramAccount = useQuery({
    queryKey: ['get-program-account', { cluster }],
    queryFn: () => connection.getParsedAccountInfo(programId),
  });

  const vote = useMutation({
    mutationKey: ['voting', 'vote', { cluster }],
    mutationFn: (candidate: string) =>
      program.methods.vote(
        candidate,
        new BN(1),
      ).rpc(),
      onSuccess: (signature) => {
        transactionToast(signature);
        return accounts.refetch();
      },
      onError: () => toast.error('Failed to vote for candidate'),
  });

  return {
    program,
    programId,
    accounts,
    polls,
    getProgramAccount,
    vote,
    candidates
  };
}
