import { BigNumber } from '@ethersproject/bignumber'
import type { TransactionResponse } from '@ethersproject/providers'
import { Trans } from '@lingui/macro'
import { TraceEvent } from '@uniswap/analytics'
import { BrowserEvent, InterfaceElementName, InterfaceEventName } from '@uniswap/analytics-events'
import { Currency, CurrencyAmount, Percent } from '@uniswap/sdk-core'
import { FeeAmount, NonfungiblePositionManager } from '@uniswap/v3-sdk'
import { useWeb3React } from '@web3-react/core'
import SOLO_WETH_DAI_ABI from 'abis/solo/SoloWETHDAIPool.json'
import WETH_ABI from 'abis/solo/WETH_solo.json'
import { sendEvent } from 'components/analytics'
import Loader from 'components/Loader'
import Modal from 'components/Modal'
import UnsupportedCurrencyFooter from 'components/swap/UnsupportedCurrencyFooter'
import { TransactionSubmittedContent } from 'components/TransactionConfirmationModal'
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { ethers } from 'ethers'
import useParsedQueryString from 'hooks/useParsedQueryString'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Text } from 'rebass'
import {
  useRangeHopCallbacks,
  useV3DerivedMintInfo,
  useV3MintActionHandlers,
  useV3MintState,
} from 'state/mint/v3/hooks'
import { useTheme } from 'styled-components/macro'

import { ButtonLight, ButtonPrimary } from '../../components/Button'
import { AutoColumn } from '../../components/Column'
import CurrencyInputPanel from '../../components/CurrencyInputPanel'
import { AddRemoveTabs } from '../../components/NavigationTabs'
import RateToggle from '../../components/RateToggle'
import Row from '../../components/Row'
import { SwitchLocaleLink } from '../../components/SwitchLocaleLink'
import TransactionConfirmationModal, { ConfirmationModalContent } from '../../components/TransactionConfirmationModal'
import { NONFUNGIBLE_POSITION_MANAGER_ADDRESSES } from '../../constants/addresses'
import { ZERO_PERCENT } from '../../constants/misc'
import { WRAPPED_NATIVE_CURRENCY } from '../../constants/tokens'
import { useCurrency } from '../../hooks/Tokens'
import { ApprovalState, useApproveCallback } from '../../hooks/useApproveCallback'
import { useArgentWalletContract } from '../../hooks/useArgentWalletContract'
import { useV3NFTPositionManagerContract } from '../../hooks/useContract'
import { useDerivedPositionInfo } from '../../hooks/useDerivedPositionInfo'
import { useStablecoinValue } from '../../hooks/useStablecoinPrice'
import useTransactionDeadline from '../../hooks/useTransactionDeadline'
import { useV3PositionFromTokenId } from '../../hooks/useV3Positions'
import { useToggleWalletModal } from '../../state/application/hooks'
import { Bound, Field } from '../../state/mint/v3/actions'
import { useTransactionAdder } from '../../state/transactions/hooks'
import { TransactionType } from '../../state/transactions/types'
import { useIsExpertMode, useUserSlippageToleranceWithDefault } from '../../state/user/hooks'
import { BackArrow, ThemedText } from '../../theme'
import approveAmountCalldata from '../../utils/approveAmountCalldata'
import { calculateGasMargin } from '../../utils/calculateGasMargin'
import { currencyId } from '../../utils/currencyId'
import { maxAmountSpend } from '../../utils/maxAmountSpend'
import { Review } from './Review'
import { DynamicSection, PageWrapper, ScrollablePage, Wrapper } from './styled'

const DEFAULT_ADD_IN_RANGE_SLIPPAGE_TOLERANCE = new Percent(50, 10_000)

export default function SoloDeposit() {
  const navigate = useNavigate()
  const {
    currencyIdA,
    currencyIdB,
    feeAmount: feeAmountFromUrl,
    tokenId,
  } = useParams<{ currencyIdA?: string; currencyIdB?: string; feeAmount?: string; tokenId?: string }>()
  const { account, chainId, provider } = useWeb3React()
  const theme = useTheme()

  const toggleWalletModal = useToggleWalletModal() // toggle wallet when disconnected
  const expertMode = useIsExpertMode()
  const addTransaction = useTransactionAdder()
  const positionManager = useV3NFTPositionManagerContract()
  const parsedQs = useParsedQueryString()

  // check for existing position if tokenId in url
  const { position: existingPositionDetails, loading: positionLoading } = useV3PositionFromTokenId(
    tokenId ? BigNumber.from(tokenId) : undefined
  )
  const hasExistingPosition = !!existingPositionDetails && !positionLoading
  const { position: existingPosition } = useDerivedPositionInfo(existingPositionDetails)

  const signer = provider?.getSigner()
  const wethContract = new ethers.Contract('0xCC57bcE47D2d624668fe1A388758fD5D91065d33', WETH_ABI, signer)
  const daiContract = new ethers.Contract('0xB704143D415d6a3a9e851DA5e76B64a5D99d718b', WETH_ABI, signer)

  const soloPoolContract = new ethers.Contract('0x2602ec23b476199e201257f04C260B4487D46Ab5', SOLO_WETH_DAI_ABI, signer)

  const soloPoolContractStatic = new ethers.Contract(
    '0x2602ec23b476199e201257f04C260B4487D46Ab5',
    SOLO_WETH_DAI_ABI,
    provider
  )

  // fee selection from url
  const feeAmount: FeeAmount | undefined =
    feeAmountFromUrl && Object.values(FeeAmount).includes(parseFloat(feeAmountFromUrl))
      ? parseFloat(feeAmountFromUrl)
      : undefined

  const baseCurrency = useCurrency(currencyIdA)
  const currencyB = useCurrency(currencyIdB)
  // prevent an error if they input ETH/WETH
  const quoteCurrency =
    baseCurrency && currencyB && baseCurrency.wrapped.equals(currencyB.wrapped) ? undefined : currencyB

  // mint state
  const { independentField, typedValue, startPriceTypedValue, rightRangeTypedValue, leftRangeTypedValue } =
    useV3MintState()

  const {
    pool,
    ticks,
    dependentField,
    price,
    pricesAtTicks,
    parsedAmounts,
    currencyBalances,
    position,
    noLiquidity,
    currencies,
    errorMessage,
    invalidPool,
    invalidRange,
    outOfRange,
    depositADisabled,
    depositBDisabled,
    invertPrice,
    ticksAtLimit,
  } = useV3DerivedMintInfo(
    baseCurrency ?? undefined,
    quoteCurrency ?? undefined,
    feeAmount,
    baseCurrency ?? undefined,
    existingPosition
  )

  const { onFieldAInput, onFieldBInput, onLeftRangeInput, onRightRangeInput, onStartPriceInput } =
    useV3MintActionHandlers(noLiquidity)

  const isValid = !errorMessage && !invalidRange

  // modal and loading
  const [showConfirm, setShowConfirm] = useState<boolean>(false)
  const [attemptingTxn, setAttemptingTxn] = useState<boolean>(false) // clicked confirm
  const [isTxnComplete, setIsTxnComplete] = useState<boolean>(false)
  const [txnHash, setTxnHash] = useState<string>('')

  // capital efficiency warning
  const [showCapitalEfficiencyWarning, setShowCapitalEfficiencyWarning] = useState(false)

  useEffect(() => setShowCapitalEfficiencyWarning(false), [baseCurrency, quoteCurrency, feeAmount])

  useEffect(() => {
    if (
      parsedQs.minPrice &&
      typeof parsedQs.minPrice === 'string' &&
      parsedQs.minPrice !== leftRangeTypedValue &&
      !isNaN(parsedQs.minPrice as any)
    ) {
      onLeftRangeInput(parsedQs.minPrice)
    }

    if (
      parsedQs.maxPrice &&
      typeof parsedQs.maxPrice === 'string' &&
      parsedQs.maxPrice !== rightRangeTypedValue &&
      !isNaN(parsedQs.maxPrice as any)
    ) {
      onRightRangeInput(parsedQs.maxPrice)
    }
  }, [parsedQs, rightRangeTypedValue, leftRangeTypedValue, onRightRangeInput, onLeftRangeInput])

  // txn values
  const deadline = useTransactionDeadline() // custom from users settings

  const [txHash, setTxHash] = useState<string>('')

  // get formatted amounts
  const formattedAmounts = {
    [independentField]: typedValue,
    [dependentField]: parsedAmounts[dependentField]?.toSignificant(6) ?? '',
  }

  const [isDepositing, setIsDepositing] = useState(false)
  const [isDepositComplete, setIsDepositComplete] = useState(false)

  const handleDeposit = useCallback(async () => {
    setIsDepositing(true)
    try {
      const userAddress = await signer?.getAddress()
      const amountToDeposit = ethers.utils.parseEther(formattedAmounts[Field.CURRENCY_A]).toString()
      await daiContract.approve('0x2602ec23b476199e201257f04C260B4487D46Ab5', amountToDeposit)
      const tx = await soloPoolContract.deposit(amountToDeposit, userAddress, { gasLimit: '1000000' })
      setIsDepositComplete(true)
      setIsDepositing(false)
      setIsTxnComplete(true)
      setTxnHash(tx.hash)
    } catch (e) {
      console.error(e)
      setIsDepositComplete(false)
      setIsDepositing(false)
    }
  }, [daiContract, formattedAmounts, signer, soloPoolContract])

  const usdcValues = {
    [Field.CURRENCY_A]: useStablecoinValue(parsedAmounts[Field.CURRENCY_A]),
    [Field.CURRENCY_B]: useStablecoinValue(parsedAmounts[Field.CURRENCY_B]),
  }

  // get the max amounts user can add
  const maxAmounts: { [field in Field]?: CurrencyAmount<Currency> } = [Field.CURRENCY_A, Field.CURRENCY_B].reduce(
    (accumulator, field) => {
      return {
        ...accumulator,
        [field]: maxAmountSpend(currencyBalances[field]),
      }
    },
    {}
  )

  const atMaxAmounts: { [field in Field]?: CurrencyAmount<Currency> } = [Field.CURRENCY_A, Field.CURRENCY_B].reduce(
    (accumulator, field) => {
      return {
        ...accumulator,
        [field]: maxAmounts[field]?.equalTo(parsedAmounts[field] ?? '0'),
      }
    },
    {}
  )

  const argentWalletContract = useArgentWalletContract()

  // check whether the user has approved the router on the tokens
  const [approvalA, approveACallback] = useApproveCallback(
    argentWalletContract ? undefined : parsedAmounts[Field.CURRENCY_A],
    chainId ? NONFUNGIBLE_POSITION_MANAGER_ADDRESSES[chainId] : undefined
  )
  const [approvalB, approveBCallback] = useApproveCallback(
    argentWalletContract ? undefined : parsedAmounts[Field.CURRENCY_B],
    chainId ? NONFUNGIBLE_POSITION_MANAGER_ADDRESSES[chainId] : undefined
  )

  const allowedSlippage = useUserSlippageToleranceWithDefault(
    outOfRange ? ZERO_PERCENT : DEFAULT_ADD_IN_RANGE_SLIPPAGE_TOLERANCE
  )

  async function onAdd() {
    if (!chainId || !provider || !account) return

    if (!positionManager || !baseCurrency || !quoteCurrency) {
      return
    }

    if (position && account && deadline) {
      const useNative = baseCurrency.isNative ? baseCurrency : quoteCurrency.isNative ? quoteCurrency : undefined
      const { calldata, value } =
        hasExistingPosition && tokenId
          ? NonfungiblePositionManager.addCallParameters(position, {
              tokenId,
              slippageTolerance: allowedSlippage,
              deadline: deadline.toString(),
              useNative,
            })
          : NonfungiblePositionManager.addCallParameters(position, {
              slippageTolerance: allowedSlippage,
              recipient: account,
              deadline: deadline.toString(),
              useNative,
              createPool: noLiquidity,
            })

      let txn: { to: string; data: string; value: string } = {
        to: NONFUNGIBLE_POSITION_MANAGER_ADDRESSES[chainId],
        data: calldata,
        value,
      }

      if (argentWalletContract) {
        const amountA = parsedAmounts[Field.CURRENCY_A]
        const amountB = parsedAmounts[Field.CURRENCY_B]
        const batch = [
          ...(amountA && amountA.currency.isToken
            ? [approveAmountCalldata(amountA, NONFUNGIBLE_POSITION_MANAGER_ADDRESSES[chainId])]
            : []),
          ...(amountB && amountB.currency.isToken
            ? [approveAmountCalldata(amountB, NONFUNGIBLE_POSITION_MANAGER_ADDRESSES[chainId])]
            : []),
          {
            to: txn.to,
            data: txn.data,
            value: txn.value,
          },
        ]
        const data = argentWalletContract.interface.encodeFunctionData('wc_multiCall', [batch])
        txn = {
          to: argentWalletContract.address,
          data,
          value: '0x0',
        }
      }

      setAttemptingTxn(true)

      provider
        .getSigner()
        .estimateGas(txn)
        .then((estimate) => {
          const newTxn = {
            ...txn,
            gasLimit: calculateGasMargin(estimate),
          }

          return provider
            .getSigner()
            .sendTransaction(newTxn)
            .then((response: TransactionResponse) => {
              setAttemptingTxn(false)
              addTransaction(response, {
                type: TransactionType.ADD_LIQUIDITY_V3_POOL,
                baseCurrencyId: currencyId(baseCurrency),
                quoteCurrencyId: currencyId(quoteCurrency),
                createPool: Boolean(noLiquidity),
                expectedAmountBaseRaw: parsedAmounts[Field.CURRENCY_A]?.quotient?.toString() ?? '0',
                expectedAmountQuoteRaw: parsedAmounts[Field.CURRENCY_B]?.quotient?.toString() ?? '0',
                feeAmount: position.pool.fee,
              })
              setTxHash(response.hash)
              sendEvent({
                category: 'Liquidity',
                action: 'Add',
                label: [currencies[Field.CURRENCY_A]?.symbol, currencies[Field.CURRENCY_B]?.symbol].join('/'),
              })
            })
        })
        .catch((error) => {
          console.error('Failed to send transaction', error)
          setAttemptingTxn(false)
          // we only care if the error is something _other_ than the user rejected the tx
          if (error?.code !== 4001) {
            console.error(error)
          }
        })
    } else {
      return
    }
  }

  const handleCurrencySelect = useCallback(
    (currencyNew: Currency, currencyIdOther?: string): (string | undefined)[] => {
      const currencyIdNew = currencyId(currencyNew)

      if (currencyIdNew === currencyIdOther) {
        // not ideal, but for now clobber the other if the currency ids are equal
        return [currencyIdNew, undefined]
      } else {
        // prevent weth + eth
        const isETHOrWETHNew =
          currencyIdNew === 'ETH' ||
          (chainId !== undefined && currencyIdNew === WRAPPED_NATIVE_CURRENCY[chainId]?.address)
        const isETHOrWETHOther =
          currencyIdOther !== undefined &&
          (currencyIdOther === 'ETH' ||
            (chainId !== undefined && currencyIdOther === WRAPPED_NATIVE_CURRENCY[chainId]?.address))

        if (isETHOrWETHNew && isETHOrWETHOther) {
          return [currencyIdNew, undefined]
        } else {
          return [currencyIdNew, currencyIdOther]
        }
      }
    },
    [chainId]
  )

  const handleCurrencyASelect = useCallback(
    (currencyANew: Currency) => {
      const [idA, idB] = handleCurrencySelect(currencyANew, currencyIdB)
      if (idB === undefined) {
        navigate(`/add/${idA}`)
      } else {
        navigate(`/add/${idA}/${idB}`)
      }
    },
    [handleCurrencySelect, currencyIdB, navigate]
  )

  const handleCurrencyBSelect = useCallback(
    (currencyBNew: Currency) => {
      const [idB, idA] = handleCurrencySelect(currencyBNew, currencyIdA)
      if (idA === undefined) {
        navigate(`/add/${idB}`)
      } else {
        navigate(`/add/${idA}/${idB}`)
      }
    },
    [handleCurrencySelect, currencyIdA, navigate]
  )

  const handleFeePoolSelect = useCallback(
    (newFeeAmount: FeeAmount) => {
      onLeftRangeInput('')
      onRightRangeInput('')
      navigate(`/add/${currencyIdA}/${currencyIdB}/${newFeeAmount}`)
    },
    [currencyIdA, currencyIdB, navigate, onLeftRangeInput, onRightRangeInput]
  )

  const handleDismissConfirmation = useCallback(() => {
    setShowConfirm(false)
    // if there was a tx hash, we want to clear the input
    if (txHash) {
      onFieldAInput('')
      // dont jump to pool page if creating
      navigate('/deposit')
    }
    setTxHash('')
  }, [navigate, onFieldAInput, txHash])

  // const addIsUnsupported = useIsSwapUnsupported(currencies?.CURRENCY_A, currencies?.CURRENCY_B)
  const addIsUnsupported = false

  const clearAll = useCallback(() => {
    onFieldAInput('')
    onFieldBInput('')
    onLeftRangeInput('')
    onRightRangeInput('')
    navigate(`/add`)
  }, [navigate, onFieldAInput, onFieldBInput, onLeftRangeInput, onRightRangeInput])

  // get value and prices at ticks
  const { [Bound.LOWER]: tickLower, [Bound.UPPER]: tickUpper } = ticks
  const { [Bound.LOWER]: priceLower, [Bound.UPPER]: priceUpper } = pricesAtTicks

  const { getDecrementLower, getIncrementLower, getDecrementUpper, getIncrementUpper, getSetFullRange } =
    useRangeHopCallbacks(baseCurrency ?? undefined, quoteCurrency ?? undefined, feeAmount, tickLower, tickUpper, pool)

  // we need an existence check on parsed amounts for single-asset deposits
  const showApprovalA =
    !argentWalletContract && approvalA !== ApprovalState.APPROVED && !!parsedAmounts[Field.CURRENCY_A]
  const showApprovalB =
    !argentWalletContract && approvalB !== ApprovalState.APPROVED && !!parsedAmounts[Field.CURRENCY_B]

  const pendingText = `Supplying ${!depositADisabled ? parsedAmounts[Field.CURRENCY_A]?.toSignificant(6) : ''} ${
    !depositADisabled ? currencies[Field.CURRENCY_A]?.symbol : ''
  } ${!outOfRange ? 'and' : ''} ${!depositBDisabled ? parsedAmounts[Field.CURRENCY_B]?.toSignificant(6) : ''} ${
    !depositBDisabled ? currencies[Field.CURRENCY_B]?.symbol : ''
  }`

  const Buttons = () =>
    addIsUnsupported ? (
      <ButtonPrimary disabled={true} $borderRadius="12px" padding="12px">
        <ThemedText.DeprecatedMain mb="4px">
          <Trans>Unsupported Asset</Trans>
        </ThemedText.DeprecatedMain>
      </ButtonPrimary>
    ) : !account ? (
      <TraceEvent
        events={[BrowserEvent.onClick]}
        name={InterfaceEventName.CONNECT_WALLET_BUTTON_CLICKED}
        properties={{ received_swap_quote: false }}
        element={InterfaceElementName.CONNECT_WALLET_BUTTON}
      >
        <ButtonLight onClick={toggleWalletModal} $borderRadius="12px" padding="12px">
          <Trans>Connect Wallet</Trans>
        </ButtonLight>
      </TraceEvent>
    ) : (
      <ButtonPrimary onClick={handleDeposit}>{isDepositing ? <Loader size="20px" /> : 'Deposit'}</ButtonPrimary>
    )
  //   <AutoColumn gap="md">
  //     {(approvalA === ApprovalState.NOT_APPROVED ||
  //       approvalA === ApprovalState.PENDING ||
  //       approvalB === ApprovalState.NOT_APPROVED ||
  //       approvalB === ApprovalState.PENDING) &&
  //       isValid && (
  //         <RowBetween>
  //           {showApprovalA && (
  //             <ButtonPrimary
  //               onClick={approveACallback}
  //               disabled={approvalA === ApprovalState.PENDING}
  //               width={showApprovalB ? '48%' : '100%'}
  //             >
  //               {approvalA === ApprovalState.PENDING ? (
  //                 <Dots>
  //                   <Trans>Approving {currencies[Field.CURRENCY_A]?.symbol}</Trans>
  //                 </Dots>
  //               ) : (
  //                 <Trans>Approve {currencies[Field.CURRENCY_A]?.symbol}</Trans>
  //               )}
  //             </ButtonPrimary>
  //           )}
  //           {showApprovalB && (
  //             <ButtonPrimary
  //               onClick={approveBCallback}
  //               disabled={approvalB === ApprovalState.PENDING}
  //               width={showApprovalA ? '48%' : '100%'}
  //             >
  //               {approvalB === ApprovalState.PENDING ? (
  //                 <Dots>
  //                   <Trans>Approving {currencies[Field.CURRENCY_B]?.symbol}</Trans>
  //                 </Dots>
  //               ) : (
  //                 <Trans>Approve {currencies[Field.CURRENCY_B]?.symbol}</Trans>
  //               )}
  //             </ButtonPrimary>
  //           )}
  //         </RowBetween>
  //       )}
  //     <ButtonError
  //       onClick={() => {
  //         expertMode ? onAdd() : setShowConfirm(true)
  //       }}
  //       disabled={
  //         !isValid ||
  //         (!argentWalletContract && approvalA !== ApprovalState.APPROVED && !depositADisabled) ||
  //         (!argentWalletContract && approvalB !== ApprovalState.APPROVED && !depositBDisabled)
  //       }
  //       error={!isValid && !!parsedAmounts[Field.CURRENCY_A] && !!parsedAmounts[Field.CURRENCY_B]}
  //     >
  //       <Text fontWeight={500}>{errorMessage ? errorMessage : <Trans>Preview</Trans>}</Text>
  //     </ButtonError>
  //   </AutoColumn>
  // )

  return (
    <>
      <ScrollablePage>
        <TransactionConfirmationModal
          isOpen={showConfirm}
          onDismiss={handleDismissConfirmation}
          attemptingTxn={attemptingTxn}
          hash={txHash}
          content={() => (
            <ConfirmationModalContent
              title={<Trans>Add Liquidity</Trans>}
              onDismiss={handleDismissConfirmation}
              topContent={() => (
                <Review
                  parsedAmounts={parsedAmounts}
                  position={position}
                  existingPosition={existingPosition}
                  priceLower={priceLower}
                  priceUpper={priceUpper}
                  outOfRange={outOfRange}
                  ticksAtLimit={ticksAtLimit}
                />
              )}
              bottomContent={() => (
                <ButtonPrimary style={{ marginTop: '1rem' }} onClick={onAdd}>
                  <Text fontWeight={500} fontSize={20}>
                    <Trans>Add</Trans>
                  </Text>
                </ButtonPrimary>
              )}
            />
          )}
          pendingText={pendingText}
        />
        <BackArrow to="/earn" />
        <PageWrapper wide={!hasExistingPosition}>
          <AddRemoveTabs
            creating={false}
            adding={true}
            positionID={tokenId}
            defaultSlippage={DEFAULT_ADD_IN_RANGE_SLIPPAGE_TOLERANCE}
            showBackLink={!hasExistingPosition}
          >
            {!hasExistingPosition && (
              <Row justifyContent="flex-end" style={{ width: 'fit-content', minWidth: 'fit-content' }}>
                {/* <MediumOnly>
                  <ButtonText onClick={clearAll} margin="0 15px 0 0">
                    <ThemedText.DeprecatedBlue fontSize="12px">
                      <Trans>Clear All</Trans>
                    </ThemedText.DeprecatedBlue>
                  </ButtonText>
                </MediumOnly> */}
                {baseCurrency && quoteCurrency ? (
                  <RateToggle
                    currencyA={baseCurrency}
                    currencyB={quoteCurrency}
                    handleRateToggle={() => {
                      if (!ticksAtLimit[Bound.LOWER] && !ticksAtLimit[Bound.UPPER]) {
                        onLeftRangeInput((invertPrice ? priceLower : priceUpper?.invert())?.toSignificant(6) ?? '')
                        onRightRangeInput((invertPrice ? priceUpper : priceLower?.invert())?.toSignificant(6) ?? '')
                        onFieldAInput(formattedAmounts[Field.CURRENCY_B] ?? '')
                      }
                      navigate(
                        `/add/${currencyIdB as string}/${currencyIdA as string}${feeAmount ? '/' + feeAmount : ''}`
                      )
                    }}
                  />
                ) : null}
              </Row>
            )}
          </AddRemoveTabs>
          <Wrapper>
            <div>
              <DynamicSection
              // disabled={tickLower === undefined || tickUpper === undefined || invalidPool || invalidRange}
              >
                <AutoColumn gap="md">
                  <ThemedText.DeprecatedLabel>
                    {hasExistingPosition ? <Trans>Add more liquidity</Trans> : <Trans>Deposit Token</Trans>}
                  </ThemedText.DeprecatedLabel>

                  <CurrencyInputPanel
                    value={formattedAmounts[Field.CURRENCY_A]}
                    onUserInput={onFieldAInput}
                    onMax={() => {
                      onFieldAInput(maxAmounts[Field.CURRENCY_A]?.toExact() ?? '')
                    }}
                    showMaxButton={!atMaxAmounts[Field.CURRENCY_A]}
                    currency={currencies[Field.CURRENCY_A] ?? null}
                    id="add-liquidity-input-tokena"
                    fiatValue={usdcValues[Field.CURRENCY_A]}
                    showCommonBases
                    locked={depositADisabled}
                    onCurrencySelect={handleCurrencyASelect}
                    isCurrencySelectAllowed={true}
                  />
                </AutoColumn>
              </DynamicSection>
            </div>

            {/* {!hasExistingPosition ? (
                <>
                  <HideMedium>
                    <Buttons />
                  </HideMedium>
                  <RightContainer gap="lg">
                    <DynamicSection gap="md" disabled={!feeAmount || invalidPool}>
                      {!noLiquidity ? (
                        <>
                          <RowBetween>
                            <ThemedText.DeprecatedLabel>
                              <Trans>Set Price Range</Trans>
                            </ThemedText.DeprecatedLabel>
                          </RowBetween>

                          {price && baseCurrency && quoteCurrency && !noLiquidity && (
                            <AutoRow gap="4px" justify="center" style={{ marginTop: '0.5rem' }}>
                              <Trans>
                                <ThemedText.DeprecatedMain
                                  fontWeight={500}
                                  textAlign="center"
                                  fontSize={12}
                                  color="text1"
                                >
                                  Current Price:
                                </ThemedText.DeprecatedMain>
                                <ThemedText.DeprecatedBody
                                  fontWeight={500}
                                  textAlign="center"
                                  fontSize={12}
                                  color="text1"
                                >
                                  <HoverInlineText
                                    maxCharacters={20}
                                    text={invertPrice ? price.invert().toSignificant(6) : price.toSignificant(6)}
                                  />
                                </ThemedText.DeprecatedBody>
                                <ThemedText.DeprecatedBody color="text2" fontSize={12}>
                                  {quoteCurrency?.symbol} per {baseCurrency.symbol}
                                </ThemedText.DeprecatedBody>
                              </Trans>
                            </AutoRow>
                          )}

                          <LiquidityChartRangeInput
                            currencyA={baseCurrency ?? undefined}
                            currencyB={quoteCurrency ?? undefined}
                            feeAmount={feeAmount}
                            ticksAtLimit={ticksAtLimit}
                            price={
                              price ? parseFloat((invertPrice ? price.invert() : price).toSignificant(8)) : undefined
                            }
                            priceLower={priceLower}
                            priceUpper={priceUpper}
                            onLeftRangeInput={onLeftRangeInput}
                            onRightRangeInput={onRightRangeInput}
                            interactive={!hasExistingPosition}
                          />
                        </>
                      ) : (
                        <AutoColumn gap="md">
                          <RowBetween>
                            <ThemedText.DeprecatedLabel>
                              <Trans>Set Starting Price</Trans>
                            </ThemedText.DeprecatedLabel>
                          </RowBetween>
                          {noLiquidity && (
                            <BlueCard
                              style={{
                                display: 'flex',
                                flexDirection: 'row',
                                alignItems: 'center',
                                padding: '1rem 1rem',
                              }}
                            >
                              <ThemedText.DeprecatedBody
                                fontSize={14}
                                style={{ fontWeight: 500 }}
                                textAlign="left"
                                color={theme.accentAction}
                              >
                                <Trans>
                                  This pool must be initialized before you can add liquidity. To initialize, select a
                                  starting price for the pool. Then, enter your liquidity price range and deposit
                                  amount. Gas fees will be higher than usual due to the initialization transaction.
                                </Trans>
                              </ThemedText.DeprecatedBody>
                            </BlueCard>
                          )}
                          <OutlineCard padding="12px">
                            <StyledInput
                              className="start-price-input"
                              value={startPriceTypedValue}
                              onUserInput={onStartPriceInput}
                            />
                          </OutlineCard>
                          <RowBetween
                            style={{ backgroundColor: theme.deprecated_bg1, padding: '12px', borderRadius: '12px' }}
                          >
                            <ThemedText.DeprecatedMain>
                              <Trans>Current {baseCurrency?.symbol} Price:</Trans>
                            </ThemedText.DeprecatedMain>
                            <ThemedText.DeprecatedMain>
                              {price ? (
                                <ThemedText.DeprecatedMain>
                                  <RowFixed>
                                    <HoverInlineText
                                      maxCharacters={20}
                                      text={invertPrice ? price?.invert()?.toSignificant(5) : price?.toSignificant(5)}
                                    />{' '}
                                    <span style={{ marginLeft: '4px' }}>{quoteCurrency?.symbol}</span>
                                  </RowFixed>
                                </ThemedText.DeprecatedMain>
                              ) : (
                                '-'
                              )}
                            </ThemedText.DeprecatedMain>
                          </RowBetween>
                        </AutoColumn>
                      )}
                    </DynamicSection>

                    <DynamicSection
                      gap="md"
                      disabled={!feeAmount || invalidPool || (noLiquidity && !startPriceTypedValue)}
                    >
                      <StackedContainer>
                        <StackedItem style={{ opacity: showCapitalEfficiencyWarning ? '0.05' : 1 }}>
                          <AutoColumn gap="md">
                            {noLiquidity && (
                              <RowBetween>
                                <ThemedText.DeprecatedLabel>
                                  <Trans>Set Price Range</Trans>
                                </ThemedText.DeprecatedLabel>
                              </RowBetween>
                            )}
                            <RangeSelector
                              priceLower={priceLower}
                              priceUpper={priceUpper}
                              getDecrementLower={getDecrementLower}
                              getIncrementLower={getIncrementLower}
                              getDecrementUpper={getDecrementUpper}
                              getIncrementUpper={getIncrementUpper}
                              onLeftRangeInput={onLeftRangeInput}
                              onRightRangeInput={onRightRangeInput}
                              currencyA={baseCurrency}
                              currencyB={quoteCurrency}
                              feeAmount={feeAmount}
                              ticksAtLimit={ticksAtLimit}
                            />
                            {!noLiquidity && (
                              <PresetsButtons
                                setFullRange={() => {
                                  setShowCapitalEfficiencyWarning(true)
                                }}
                              />
                            )}
                          </AutoColumn>
                        </StackedItem>

                        {showCapitalEfficiencyWarning && (
                          <StackedItem zIndex={1}>
                            <YellowCard
                              padding="15px"
                              $borderRadius="12px"
                              height="100%"
                              style={{
                                borderColor: theme.deprecated_yellow3,
                                border: '1px solid',
                              }}
                            >
                              <AutoColumn gap="sm" style={{ height: '100%' }}>
                                <RowFixed>
                                  <AlertTriangle stroke={theme.deprecated_yellow3} size="16px" />
                                  <ThemedText.DeprecatedYellow ml="12px" fontSize="15px">
                                    <Trans>Efficiency Comparison</Trans>
                                  </ThemedText.DeprecatedYellow>
                                </RowFixed>
                                <RowFixed>
                                  <ThemedText.DeprecatedYellow ml="12px" fontSize="13px" margin={0} fontWeight={400}>
                                    <Trans>
                                      Full range positions may earn less fees than concentrated positions. Learn more{' '}
                                      <ExternalLink
                                        style={{ color: theme.deprecated_yellow3, textDecoration: 'underline' }}
                                        href="https://help.uniswap.org/en/articles/5434296-can-i-provide-liquidity-over-the-full-range-in-v3"
                                      >
                                        here
                                      </ExternalLink>
                                      .
                                    </Trans>
                                  </ThemedText.DeprecatedYellow>
                                </RowFixed>
                                <Row>
                                  <ButtonYellow
                                    padding="8px"
                                    marginRight="8px"
                                    $borderRadius="8px"
                                    width="auto"
                                    onClick={() => {
                                      setShowCapitalEfficiencyWarning(false)
                                      getSetFullRange()
                                    }}
                                  >
                                    <ThemedText.DeprecatedBlack fontSize={13} color="black">
                                      <Trans>I understand</Trans>
                                    </ThemedText.DeprecatedBlack>
                                  </ButtonYellow>
                                </Row>
                              </AutoColumn>
                            </YellowCard>
                          </StackedItem>
                        )}
                      </StackedContainer>

                      {outOfRange ? (
                        <YellowCard padding="8px 12px" $borderRadius="12px">
                          <RowBetween>
                            <AlertTriangle stroke={theme.deprecated_yellow3} size="16px" />
                            <ThemedText.DeprecatedYellow ml="12px" fontSize="12px">
                              <Trans>
                                Your position will not earn fees or be used in trades until the market price moves into
                                your range.
                              </Trans>
                            </ThemedText.DeprecatedYellow>
                          </RowBetween>
                        </YellowCard>
                      ) : null}

                      {invalidRange ? (
                        <YellowCard padding="8px 12px" $borderRadius="12px">
                          <RowBetween>
                            <AlertTriangle stroke={theme.deprecated_yellow3} size="16px" />
                            <ThemedText.DeprecatedYellow ml="12px" fontSize="12px">
                              <Trans>Invalid range selected. The min price must be lower than the max price.</Trans>
                            </ThemedText.DeprecatedYellow>
                          </RowBetween>
                        </YellowCard>
                      ) : null}
                    </DynamicSection>

                    <MediumOnly>
                      <Buttons />
                    </MediumOnly>
                  </RightContainer>
                </>
              ) : (
                <Buttons />
              )} */}
            <div style={{ marginTop: '15px' }}>
              <Buttons />
            </div>
          </Wrapper>
          <Modal
            isOpen={isTxnComplete}
            $scrollOverlay={true}
            onDismiss={() => {
              setTxnHash('')
              setIsTxnComplete(false)
            }}
            maxHeight={90}
          >
            <TransactionSubmittedContent
              chainId={80001}
              hash={txnHash}
              onDismiss={() => {
                setTxnHash('')
                setIsTxnComplete(false)
              }}
              currencyToAdd={undefined}
            />
          </Modal>
        </PageWrapper>
        {addIsUnsupported && (
          <UnsupportedCurrencyFooter
            show={addIsUnsupported}
            currencies={[currencies.CURRENCY_A, currencies.CURRENCY_B]}
          />
        )}
      </ScrollablePage>
      <SwitchLocaleLink />
    </>
  )
}
