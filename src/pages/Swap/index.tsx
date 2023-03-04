/* eslint-disable import/no-unused-modules */
import { Trans } from '@lingui/macro'
import { sendAnalyticsEvent, Trace, TraceEvent } from '@uniswap/analytics'
import {
  BrowserEvent,
  InterfaceElementName,
  InterfaceEventName,
  InterfacePageName,
  InterfaceSectionName,
  SwapEventName,
} from '@uniswap/analytics-events'
import { Trade } from '@uniswap/router-sdk'
import { Currency, CurrencyAmount, Percent, Token, TradeType } from '@uniswap/sdk-core'
import { UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk'
import { FeeAmount } from '@uniswap/v3-sdk'
import { useWeb3React } from '@web3-react/core'
import SOLO_WETH_DAI_ABI from 'abis/solo/SoloWETHDAIPool.json'
import WETH_ABI from 'abis/solo/WETH.json'
import { sendEvent } from 'components/analytics'
import Modal from 'components/Modal'
import PriceImpactWarning from 'components/swap/PriceImpactWarning'
import SwapDetailsDropdown from 'components/swap/SwapDetailsDropdown'
import { SoloProtocol, SoloRoutingDiagramEntry } from 'components/swap/SwapRoute'
import TokenSafetyModal from 'components/TokenSafety/TokenSafetyModal'
import { MouseoverTooltip } from 'components/Tooltip'
import { TransactionSubmittedContent } from 'components/TransactionConfirmationModal'
import Widget from 'components/Widget'
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { BigNumber, ethers } from 'ethers'
import { usePermit2Enabled } from 'featureFlags/flags/permit2'
import { useSwapWidgetEnabled } from 'featureFlags/flags/swapWidget'
import usePermit2Allowance, { AllowanceState } from 'hooks/usePermit2Allowance'
import { useSwapCallback } from 'hooks/useSwapCallback'
import useTransactionDeadline from 'hooks/useTransactionDeadline'
import JSBI from 'jsbi'
import { formatSwapQuoteReceivedEventProperties } from 'lib/utils/analytics'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ReactNode } from 'react'
import { ArrowDown, CheckCircle, HelpCircle, Info } from 'react-feather'
import { useNavigate } from 'react-router-dom'
import { Text } from 'rebass'
import { useToggleWalletModal } from 'state/application/hooks'
import { InterfaceTrade } from 'state/routing/types'
import { TradeState } from 'state/routing/types'
import styled, { useTheme } from 'styled-components/macro'
import { currencyAmountToPreciseFloat, formatTransactionAmount } from 'utils/formatNumbers'

import AddressInputPanel from '../../components/AddressInputPanel'
import { ButtonConfirmed, ButtonError, ButtonLight, ButtonPrimary } from '../../components/Button'
import { GrayCard } from '../../components/Card'
import { AutoColumn } from '../../components/Column'
import SwapCurrencyInputPanel from '../../components/CurrencyInputPanel/SwapCurrencyInputPanel'
import Loader from '../../components/Loader'
import { AutoRow } from '../../components/Row'
import ConfirmSwapModal from '../../components/swap/ConfirmSwapModal'
import { ArrowWrapper, PageWrapper, SwapCallbackError, SwapWrapper } from '../../components/swap/styleds'
import SwapHeader from '../../components/swap/SwapHeader'
import { SwitchLocaleLink } from '../../components/SwitchLocaleLink'
import { TOKEN_SHORTHANDS } from '../../constants/tokens'
import { useAllTokens, useCurrency } from '../../hooks/Tokens'
import { ApprovalState, useApproveCallbackFromTrade } from '../../hooks/useApproveCallback'
import useENSAddress from '../../hooks/useENSAddress'
import { useERC20PermitFromTrade, UseERC20PermitState } from '../../hooks/useERC20Permit'
import useIsArgentWallet from '../../hooks/useIsArgentWallet'
import { useIsSwapUnsupported } from '../../hooks/useIsSwapUnsupported'
import { useStablecoinValue } from '../../hooks/useStablecoinPrice'
import useWrapCallback, { WrapErrorText, WrapType } from '../../hooks/useWrapCallback'
import { Field } from '../../state/swap/actions'
import {
  useDefaultsFromURLSearch,
  useDerivedSwapInfo,
  useSwapActionHandlers,
  useSwapState,
} from '../../state/swap/hooks'
import { useExpertModeManager } from '../../state/user/hooks'
import { LinkStyledButton, ThemedText } from '../../theme'
import { computeFiatValuePriceImpact } from '../../utils/computeFiatValuePriceImpact'
import { maxAmountSpend } from '../../utils/maxAmountSpend'
import { computeRealizedPriceImpact, warningSeverity } from '../../utils/prices'
import { supportedChainId } from '../../utils/supportedChainId'

const ArrowContainer = styled.div`
  display: inline-block;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  width: 100%;
  height: 100%;
`

const SwapSection = styled.div`
  position: relative;
  background-color: ${({ theme }) => theme.backgroundModule};
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 4px;
  color: ${({ theme }) => theme.textSecondary};
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;

  &:before {
    box-sizing: border-box;
    background-size: 100%;
    border-radius: inherit;

    position: absolute;
    top: 0;
    left: 0;

    width: 100%;
    height: 100%;
    pointer-events: none;
    content: '';
    border: 1px solid ${({ theme }) => theme.backgroundModule};
  }

  &:hover:before {
    border-color: ${({ theme }) => theme.stateOverlayHover};
  }

  &:focus-within:before {
    border-color: ${({ theme }) => theme.stateOverlayPressed};
  }
`

const OutputSwapSection = styled(SwapSection)<{ showDetailsDropdown: boolean }>`
  border-bottom: ${({ theme }) => `1px solid ${theme.backgroundSurface}`};
  border-bottom-left-radius: ${({ showDetailsDropdown }) => showDetailsDropdown && '0'};
  border-bottom-right-radius: ${({ showDetailsDropdown }) => showDetailsDropdown && '0'};
`

const DetailsSwapSection = styled(SwapSection)`
  padding: 0;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
`

export function getIsValidSwapQuote(
  trade: InterfaceTrade<Currency, Currency, TradeType> | undefined,
  tradeState: TradeState,
  swapInputError?: ReactNode
): boolean {
  return !!swapInputError && !!trade && (tradeState === TradeState.VALID || tradeState === TradeState.SYNCING)
}

function largerPercentValue(a?: Percent, b?: Percent) {
  if (a && b) {
    return a.greaterThan(b) ? a : b
  } else if (a) {
    return a
  } else if (b) {
    return b
  }
  return undefined
}

const TRADE_STRING = 'SwapRouter'

export default function Swap({ className }: { className?: string }) {
  const navigate = useNavigate()
  const { account, chainId } = useWeb3React()
  const loadedUrlParams = useDefaultsFromURLSearch()
  const [newSwapQuoteNeedsLogging, setNewSwapQuoteNeedsLogging] = useState(true)
  const [fetchingSwapQuoteStartTime, setFetchingSwapQuoteStartTime] = useState<Date | undefined>()
  const swapWidgetEnabled = useSwapWidgetEnabled()

  // token warning stuff
  const [loadedInputCurrency, loadedOutputCurrency] = [
    useCurrency(loadedUrlParams?.[Field.INPUT]?.currencyId),
    useCurrency(loadedUrlParams?.[Field.OUTPUT]?.currencyId),
  ]
  const [dismissTokenWarning, setDismissTokenWarning] = useState<boolean>(false)
  const urlLoadedTokens: Token[] = useMemo(
    () => [loadedInputCurrency, loadedOutputCurrency]?.filter((c): c is Token => c?.isToken ?? false) ?? [],
    [loadedInputCurrency, loadedOutputCurrency]
  )
  const handleConfirmTokenWarning = useCallback(() => {
    setDismissTokenWarning(true)
  }, [])

  // dismiss warning if all imported tokens are in active lists
  const defaultTokens = useAllTokens()
  const importTokensNotInDefault = useMemo(
    () =>
      urlLoadedTokens &&
      urlLoadedTokens
        .filter((token: Token) => {
          return !(token.address in defaultTokens)
        })
        .filter((token: Token) => {
          // Any token addresses that are loaded from the shorthands map do not need to show the import URL
          const supported = supportedChainId(chainId)
          if (!supported) return true
          return !Object.keys(TOKEN_SHORTHANDS).some((shorthand) => {
            const shorthandTokenAddress = TOKEN_SHORTHANDS[shorthand][supported]
            return shorthandTokenAddress && shorthandTokenAddress === token.address
          })
        }),
    [chainId, defaultTokens, urlLoadedTokens]
  )

  const theme = useTheme()

  // toggle wallet when disconnected
  const toggleWalletModal = useToggleWalletModal()

  // for expert mode
  const [isExpertMode] = useExpertModeManager()
  // swap state
  const { independentField, typedValue, recipient } = useSwapState()
  const {
    trade: { state: tradeState, trade },
    allowedSlippage,
    currencyBalances,
    parsedAmount,
    currencies,
    inputError: swapInputError,
  } = useDerivedSwapInfo()

  const {
    wrapType,
    execute: onWrap,
    inputError: wrapInputError,
  } = useWrapCallback(currencies[Field.INPUT], currencies[Field.OUTPUT], typedValue)
  const showWrap: boolean = wrapType !== WrapType.NOT_APPLICABLE
  const { address: recipientAddress } = useENSAddress(recipient)

  const [isApproved, setIsApproved] = useState(false)
  const [isTxnComplete, setIsTxnComplete] = useState(false)
  const [txnHash, setTxnHash] = useState('')
  const [simulatedTxnOutputs, setSimulatedTxnOutputs] = useState<BigNumber[]>([
    ethers.utils.parseEther('0'),
    ethers.utils.parseEther('0'),
    ethers.utils.parseEther('0'),
    ethers.utils.parseEther('0'),
  ])
  const [routes, setRoutes] = useState<SoloRoutingDiagramEntry[]>([])

  const parsedAmounts = useMemo(
    () =>
      showWrap
        ? {
            [Field.INPUT]: parsedAmount,
            [Field.OUTPUT]: parsedAmount,
          }
        : {
            [Field.INPUT]: independentField === Field.INPUT ? parsedAmount : trade?.inputAmount,
            [Field.OUTPUT]: independentField === Field.OUTPUT ? parsedAmount : trade?.outputAmount,
          },
    [independentField, parsedAmount, showWrap, trade?.inputAmount, trade?.outputAmount]
  )
  const fiatValueInput = useStablecoinValue(parsedAmounts[Field.INPUT])
  const fiatValueOutput = useStablecoinValue(parsedAmounts[Field.OUTPUT])

  const [routeNotFound, routeIsLoading, routeIsSyncing] = useMemo(
    () => [!trade?.swaps, TradeState.LOADING === tradeState, TradeState.SYNCING === tradeState],
    [trade, tradeState]
  )

  const fiatValueTradeInput = useStablecoinValue(trade?.inputAmount)
  const fiatValueTradeOutput = useStablecoinValue(trade?.outputAmount)
  const stablecoinPriceImpact = useMemo(
    () =>
      routeIsSyncing || !trade ? undefined : computeFiatValuePriceImpact(fiatValueTradeInput, fiatValueTradeOutput),
    [fiatValueTradeInput, fiatValueTradeOutput, routeIsSyncing, trade]
  )

  const { onSwitchTokens, onCurrencySelection, onUserInput, onChangeRecipient } = useSwapActionHandlers()
  const isValid = !swapInputError
  const dependentField: Field = independentField === Field.INPUT ? Field.OUTPUT : Field.INPUT

  // reset if they close warning without tokens in params
  const handleDismissTokenWarning = useCallback(() => {
    setDismissTokenWarning(true)
    navigate('/swap/')
  }, [navigate])

  // modal and loading
  const [{ showConfirm, tradeToConfirm, swapErrorMessage, attemptingTxn, txHash }, setSwapState] = useState<{
    showConfirm: boolean
    tradeToConfirm: Trade<Currency, Currency, TradeType> | undefined
    attemptingTxn: boolean
    swapErrorMessage: string | undefined
    txHash: string | undefined
  }>({
    showConfirm: false,
    tradeToConfirm: undefined,
    attemptingTxn: false,
    swapErrorMessage: undefined,
    txHash: undefined,
  })

  const formattedAmounts = useMemo(
    () => ({
      [independentField]: typedValue,
      [dependentField]: showWrap
        ? parsedAmounts[independentField]?.toExact() ?? ''
        : formatTransactionAmount(currencyAmountToPreciseFloat(parsedAmounts[dependentField])),
    }),
    [dependentField, independentField, parsedAmounts, showWrap, typedValue]
  )

  const userHasSpecifiedInputOutput = Boolean(
    currencies[Field.INPUT] && currencies[Field.OUTPUT] && parsedAmounts[independentField]?.greaterThan(JSBI.BigInt(0))
  )

  const permit2Enabled = usePermit2Enabled()
  const maximumAmountIn = useMemo(() => {
    const maximumAmountIn = trade?.maximumAmountIn(allowedSlippage)
    return maximumAmountIn?.currency.isToken ? (maximumAmountIn as CurrencyAmount<Token>) : undefined
  }, [allowedSlippage, trade])
  const allowance = usePermit2Allowance(
    permit2Enabled
      ? maximumAmountIn ??
          (parsedAmounts[Field.INPUT]?.currency.isToken
            ? (parsedAmounts[Field.INPUT] as CurrencyAmount<Token>)
            : undefined)
      : undefined,
    permit2Enabled && chainId ? UNIVERSAL_ROUTER_ADDRESS(chainId) : undefined
  )
  const isApprovalLoading = allowance.state === AllowanceState.REQUIRED && allowance.isApprovalLoading
  const [isAllowancePending, setIsAllowancePending] = useState(false)

  // check whether the user has approved the router on the input token
  const [approvalState, approveCallback] = useApproveCallbackFromTrade(
    permit2Enabled ? undefined : trade,
    allowedSlippage
  )
  const { provider } = useWeb3React()
  const signer = provider?.getSigner()
  const wethContract = new ethers.Contract('0xCC57bcE47D2d624668fe1A388758fD5D91065d33', WETH_ABI, signer)
  const daiContract = new ethers.Contract('0xB704143D415d6a3a9e851DA5e76B64a5D99d718b', WETH_ABI, signer)

  const soloPoolContract = new ethers.Contract('0xF2EEd1CB7c599f9191eCE6E30f1e8339d8a20155', SOLO_WETH_DAI_ABI, signer)
  // const privateWallet = new ethers.Wallet('0xe185a5c33d4fd669b6dc0c8030ef4ebe728323c8ea3e1339bd5924e0159fccc2')

  // const signerPrivate = provider?.getSigner('0xe185a5c33d4fd669b6dc0c8030ef4ebe728323c8ea3e1339bd5924e0159fccc2')
  const soloPoolContractStatic = new ethers.Contract(
    '0xF2EEd1CB7c599f9191eCE6E30f1e8339d8a20155',
    SOLO_WETH_DAI_ABI,
    provider
  )

  const transactionDeadline = useTransactionDeadline()
  const {
    state: signatureState,
    signatureData,
    gatherPermitSignature,
  } = useERC20PermitFromTrade(permit2Enabled ? undefined : trade, allowedSlippage, transactionDeadline)

  const updateSimulatedTxn = useCallback(async () => {
    try {
      const op =
        currencies[Field.INPUT]?.symbol == 'WETH'
          ? independentField === Field.INPUT
            ? await soloPoolContractStatic
                ?.connect('0x3746f57a8Ef22860f61d8a6e694B14de258a96aE')
                ?.callStatic.swapExactInput(0, ethers.utils.parseEther(formattedAmounts[Field.INPUT]).toString(), {
                  gasLimit: '1000000',
                })
            : await soloPoolContractStatic
                ?.connect('0x3746f57a8Ef22860f61d8a6e694B14de258a96aE')
                ?.callStatic.swapExactInput(0, ethers.utils.parseEther(formattedAmounts[Field.OUTPUT]).toString(), {
                  gasLimit: '1000000',
                })
          : independentField === Field.INPUT
          ? await soloPoolContractStatic
              ?.connect('0x3746f57a8Ef22860f61d8a6e694B14de258a96aE')
              ?.callStatic.swapExactInput(ethers.utils.parseEther(formattedAmounts[Field.INPUT]).toString(), 0, {
                gasLimit: '1000000',
              })
          : await soloPoolContractStatic
              ?.connect('0x3746f57a8Ef22860f61d8a6e694B14de258a96aE')
              ?.callStatic.swapExactInput(ethers.utils.parseEther(formattedAmounts[Field.OUTPUT]).toString(), 0, {
                gasLimit: '1000000',
              })

      setSimulatedTxnOutputs(op)
      if (currencies.INPUT && currencies.OUTPUT) {
        const newRoutes: SoloRoutingDiagramEntry[] = []
        newRoutes.push({
          percent:
            ((parseFloat(ethers.utils.formatUnits(simulatedTxnOutputs[0])) +
              parseFloat(ethers.utils.formatUnits(simulatedTxnOutputs[1])) -
              parseFloat(ethers.utils.formatUnits(simulatedTxnOutputs[2])) -
              parseFloat(ethers.utils.formatUnits(simulatedTxnOutputs[3]))) /
              (parseFloat(ethers.utils.formatUnits(simulatedTxnOutputs[0])) +
                parseFloat(ethers.utils.formatUnits(simulatedTxnOutputs[1])))) *
            100,
          path: [[currencies.INPUT, currencies.OUTPUT, FeeAmount.LOW]],
          protocol: SoloProtocol.FLEX,
        })
        newRoutes.push({
          percent:
            ((parseFloat(ethers.utils.formatUnits(simulatedTxnOutputs[2])) +
              parseFloat(ethers.utils.formatUnits(simulatedTxnOutputs[3]))) /
              (parseFloat(ethers.utils.formatUnits(simulatedTxnOutputs[0])) +
                parseFloat(ethers.utils.formatUnits(simulatedTxnOutputs[1])))) *
            100,
          path: [[currencies.INPUT, currencies.OUTPUT, FeeAmount.LOW]],
          protocol: SoloProtocol.CONC,
        })
        setRoutes(newRoutes)
      }
    } catch (e) {
      console.error(e)
      setRoutes([])
      setSimulatedTxnOutputs([
        ethers.utils.parseEther('0'),
        ethers.utils.parseEther('0'),
        ethers.utils.parseEther('0'),
        ethers.utils.parseEther('0'),
      ])
    }
  }, [currencies, formattedAmounts, independentField, simulatedTxnOutputs, soloPoolContractStatic])

  useEffect(() => {
    updateSimulatedTxn()
  }, [parsedAmount, updateSimulatedTxn, isApproved, isApprovalLoading])

  const [approvalPending, setApprovalPending] = useState<boolean>(false)
  const handleApprove = useCallback(async () => {
    setApprovalPending(true)
    setIsAllowancePending(true)
    try {
      currencies[Field.INPUT]?.symbol == 'WETH'
        ? independentField === Field.INPUT
          ? await wethContract?.approve(
              soloPoolContract?.address,
              ethers.utils.parseEther(formattedAmounts[Field.INPUT]).toString()
            )
          : daiContract?.approve(
              soloPoolContract?.address,
              ethers.utils.parseEther(formattedAmounts[Field.OUTPUT]).toString()
            )
        : independentField === Field.INPUT
        ? daiContract?.approve(
            soloPoolContract?.address,
            ethers.utils.parseEther(formattedAmounts[Field.INPUT]).toString()
          )
        : wethContract?.approve(
            soloPoolContract?.address,
            ethers.utils.parseEther(formattedAmounts[Field.OUTPUT]).toString()
          )
    } finally {
      setApprovalPending(false)
      setIsAllowancePending(false)
      setIsApproved(true)
      updateSimulatedTxn()
    }
  }, [
    currencies,
    independentField,
    wethContract,
    soloPoolContract?.address,
    formattedAmounts,
    daiContract,
    updateSimulatedTxn,
  ])

  // check if user has gone through approval process, used to show two step buttons, reset on token change
  const [approvalSubmitted, setApprovalSubmitted] = useState<boolean>(false)

  const handleTypeInput = useCallback(
    async (value: string) => {
      onUserInput(Field.INPUT, value)
      updateSimulatedTxn()
    },
    [onUserInput, updateSimulatedTxn]
  )
  const handleTypeOutput = useCallback(
    (value: string) => {
      onUserInput(Field.OUTPUT, value)
    },
    [onUserInput]
  )

  // mark when a user has submitted an approval, reset onTokenSelection for input field
  useEffect(() => {
    if (approvalState === ApprovalState.PENDING) {
      setApprovalSubmitted(true)
    }
  }, [approvalState, approvalSubmitted])

  const maxInputAmount: CurrencyAmount<Currency> | undefined = useMemo(
    () => maxAmountSpend(currencyBalances[Field.INPUT]),
    [currencyBalances]
  )
  const showMaxButton = Boolean(maxInputAmount?.greaterThan(0) && !parsedAmounts[Field.INPUT]?.equalTo(maxInputAmount))

  // the callback to execute the swap
  const { callback: swapCallback, error: swapCallbackError } = useSwapCallback(
    trade,
    allowedSlippage,
    recipient,
    signatureData,
    allowance.state === AllowanceState.ALLOWED ? allowance.permitSignature : undefined
  )

  const handleSwap = useCallback(async () => {
    try {
      const tx =
        currencies[Field.INPUT]?.symbol == 'WETH'
          ? independentField === Field.INPUT
            ? await soloPoolContract?.swapExactInput(
                0,
                ethers.utils.parseEther(formattedAmounts[Field.INPUT]).toString(),
                {
                  gasLimit: '1000000',
                }
              )
            : await soloPoolContract?.swapExactInput(
                0,
                ethers.utils.parseEther(formattedAmounts[Field.OUTPUT]).toString(),
                {
                  gasLimit: '1000000',
                }
              )
          : independentField === Field.INPUT
          ? await soloPoolContract?.swapExactInput(
              ethers.utils.parseEther(formattedAmounts[Field.INPUT]).toString(),
              0,
              {
                gasLimit: '1000000',
              }
            )
          : await soloPoolContract?.swapExactInput(
              ethers.utils.parseEther(formattedAmounts[Field.OUTPUT]).toString(),
              0,
              {
                gasLimit: '1000000',
              }
            )
      setTxnHash(tx.hash)
    } catch (e) {
      console.error(e)
    } finally {
      setIsTxnComplete(true)
    }
  }, [currencies, independentField, soloPoolContract, formattedAmounts])

  // errors
  const [swapQuoteReceivedDate, setSwapQuoteReceivedDate] = useState<Date | undefined>()

  // warnings on the greater of fiat value price impact and execution price impact
  const { priceImpactSeverity, largerPriceImpact } = useMemo(() => {
    const marketPriceImpact = trade?.priceImpact ? computeRealizedPriceImpact(trade) : undefined
    const largerPriceImpact = largerPercentValue(marketPriceImpact, stablecoinPriceImpact)
    return { priceImpactSeverity: warningSeverity(largerPriceImpact), largerPriceImpact }
  }, [stablecoinPriceImpact, trade])

  const isArgentWallet = useIsArgentWallet()

  // show approve flow when: no error on inputs, not approved or pending, or approved in current session
  // never show if price impact is above threshold in non expert mode
  const showApproveFlow =
    !permit2Enabled &&
    !isArgentWallet &&
    !swapInputError &&
    (approvalState === ApprovalState.NOT_APPROVED ||
      approvalState === ApprovalState.PENDING ||
      (approvalSubmitted && approvalState === ApprovalState.APPROVED)) &&
    !(priceImpactSeverity > 3 && !isExpertMode)

  const handleConfirmDismiss = useCallback(() => {
    setIsTxnComplete(false)
    setIsApproved(false)
    setSwapState({ showConfirm: false, tradeToConfirm, attemptingTxn, swapErrorMessage, txHash })
    // if there was a tx hash, we want to clear the input
    if (txHash) {
      onUserInput(Field.INPUT, '')
    }
  }, [attemptingTxn, onUserInput, swapErrorMessage, tradeToConfirm, txHash])

  const handleAcceptChanges = useCallback(() => {
    setSwapState({ tradeToConfirm: trade, swapErrorMessage, txHash, attemptingTxn, showConfirm })
  }, [attemptingTxn, showConfirm, swapErrorMessage, trade, txHash])

  const handleInputSelect = useCallback(
    (inputCurrency: Currency) => {
      setApprovalSubmitted(false) // reset 2 step UI for approvals
      onCurrencySelection(Field.INPUT, inputCurrency)
    },
    [onCurrencySelection]
  )

  const handleMaxInput = useCallback(() => {
    maxInputAmount && onUserInput(Field.INPUT, maxInputAmount.toExact())
    sendEvent({
      category: 'Swap',
      action: 'Max',
    })
  }, [maxInputAmount, onUserInput])

  const handleOutputSelect = useCallback(
    (outputCurrency: Currency) => onCurrencySelection(Field.OUTPUT, outputCurrency),
    [onCurrencySelection]
  )

  const swapIsUnsupported = useIsSwapUnsupported(currencies[Field.INPUT], currencies[Field.OUTPUT])

  const priceImpactTooHigh = priceImpactSeverity > 3 && !isExpertMode
  const showPriceImpactWarning = largerPriceImpact && priceImpactSeverity > 3

  // Handle time based logging events and event properties.
  useEffect(() => {
    const now = new Date()
    // If a trade exists, and we need to log the receipt of this new swap quote:
    if (newSwapQuoteNeedsLogging && !!trade) {
      // Set the current datetime as the time of receipt of latest swap quote.
      setSwapQuoteReceivedDate(now)
      // Log swap quote.
      sendAnalyticsEvent(
        SwapEventName.SWAP_QUOTE_RECEIVED,
        formatSwapQuoteReceivedEventProperties(trade, trade.gasUseEstimateUSD ?? undefined, fetchingSwapQuoteStartTime)
      )
      // Latest swap quote has just been logged, so we don't need to log the current trade anymore
      // unless user inputs change again and a new trade is in the process of being generated.
      setNewSwapQuoteNeedsLogging(false)
      // New quote is not being fetched, so set start time of quote fetch to undefined.
      setFetchingSwapQuoteStartTime(undefined)
    }
    // If another swap quote is being loaded based on changed user inputs:
    if (routeIsLoading) {
      setNewSwapQuoteNeedsLogging(true)
      if (!fetchingSwapQuoteStartTime) setFetchingSwapQuoteStartTime(now)
    }
  }, [
    newSwapQuoteNeedsLogging,
    routeIsSyncing,
    routeIsLoading,
    fetchingSwapQuoteStartTime,
    trade,
    setSwapQuoteReceivedDate,
  ])

  const approveTokenButtonDisabled =
    approvalState !== ApprovalState.NOT_APPROVED || approvalSubmitted || signatureState === UseERC20PermitState.SIGNED

  const showDetailsDropdown = Boolean(
    !showWrap && userHasSpecifiedInputOutput && (trade || routeIsLoading || routeIsSyncing)
  )

  return (
    <Trace page={InterfacePageName.SWAP_PAGE} shouldLogImpression>
      <>
        <TokenSafetyModal
          isOpen={importTokensNotInDefault.length > 0 && !dismissTokenWarning}
          tokenAddress={importTokensNotInDefault[0]?.address}
          secondTokenAddress={importTokensNotInDefault[1]?.address}
          onContinue={handleConfirmTokenWarning}
          onCancel={handleDismissTokenWarning}
          showCancel={true}
        />
        <PageWrapper>
          {swapWidgetEnabled ? (
            <Widget
              defaultTokens={{
                [Field.INPUT]: loadedInputCurrency ?? undefined,
                [Field.OUTPUT]: loadedOutputCurrency ?? undefined,
              }}
              width="100%"
            />
          ) : (
            <SwapWrapper className={className} id="swap-page">
              <SwapHeader allowedSlippage={allowedSlippage} />
              <ConfirmSwapModal
                isOpen={showConfirm}
                trade={trade}
                originalTrade={tradeToConfirm}
                onAcceptChanges={handleAcceptChanges}
                attemptingTxn={attemptingTxn}
                txHash={txHash}
                recipient={recipient}
                allowedSlippage={allowedSlippage}
                onConfirm={handleSwap}
                swapErrorMessage={swapErrorMessage}
                onDismiss={handleConfirmDismiss}
                swapQuoteReceivedDate={swapQuoteReceivedDate}
                fiatValueInput={fiatValueTradeInput}
                fiatValueOutput={fiatValueTradeOutput}
              />

              <div style={{ display: 'relative' }}>
                <SwapSection>
                  <Trace section={InterfaceSectionName.CURRENCY_INPUT_PANEL}>
                    <SwapCurrencyInputPanel
                      label={
                        independentField === Field.OUTPUT && !showWrap ? (
                          <Trans>From (at most)</Trans>
                        ) : (
                          <Trans>From</Trans>
                        )
                      }
                      value={formattedAmounts[Field.INPUT]}
                      showMaxButton={showMaxButton}
                      currency={currencies[Field.INPUT] ?? null}
                      onUserInput={async (value) => {
                        handleTypeInput(value)
                      }}
                      onMax={handleMaxInput}
                      fiatValue={undefined}
                      onCurrencySelect={handleInputSelect}
                      otherCurrency={currencies[Field.OUTPUT]}
                      showCommonBases={true}
                      id={InterfaceSectionName.CURRENCY_INPUT_PANEL}
                      loading={independentField === Field.OUTPUT && routeIsSyncing}
                    />
                  </Trace>
                </SwapSection>
              </div>
              <AutoColumn gap="md">
                <div>
                  <OutputSwapSection showDetailsDropdown={showDetailsDropdown}>
                    <Trace section={InterfaceSectionName.CURRENCY_OUTPUT_PANEL}>
                      <SwapCurrencyInputPanel
                        value={
                          currencies.OUTPUT?.symbol == 'DAI' && currencies.INPUT?.symbol == 'WETH'
                            ? parseFloat(ethers.utils.formatEther(simulatedTxnOutputs[0])).toFixed(2).toString()
                            : currencies.INPUT?.symbol == 'DAI' && currencies.OUTPUT?.symbol == 'WETH'
                            ? parseFloat(ethers.utils.formatEther(simulatedTxnOutputs[1])).toFixed(2).toString()
                            : '0.00'
                        }
                        onUserInput={(value) => {
                          return
                        }}
                        label={
                          independentField === Field.INPUT && !showWrap ? (
                            <Trans>To (at least)</Trans>
                          ) : (
                            <Trans>To</Trans>
                          )
                        }
                        showMaxButton={false}
                        hideBalance={false}
                        fiatValue={undefined}
                        priceImpact={stablecoinPriceImpact}
                        currency={currencies[Field.OUTPUT] ?? null}
                        onCurrencySelect={handleOutputSelect}
                        otherCurrency={currencies[Field.INPUT]}
                        showCommonBases={true}
                        id={InterfaceSectionName.CURRENCY_OUTPUT_PANEL}
                        loading={independentField === Field.INPUT && routeIsSyncing}
                        isInputAllowed={false}
                      />
                    </Trace>

                    {recipient !== null && !showWrap ? (
                      <>
                        <AutoRow justify="space-between" style={{ padding: '0 1rem' }}>
                          <ArrowWrapper clickable={false}>
                            <ArrowDown size="16" color={theme.textSecondary} />
                          </ArrowWrapper>
                          <LinkStyledButton id="remove-recipient-button" onClick={() => onChangeRecipient(null)}>
                            <Trans>- Remove recipient</Trans>
                          </LinkStyledButton>
                        </AutoRow>
                        <AddressInputPanel id="recipient" value={recipient} onChange={onChangeRecipient} />
                      </>
                    ) : null}
                  </OutputSwapSection>
                  <DetailsSwapSection>
                    {currencies.INPUT &&
                      currencies.OUTPUT &&
                      ((currencies.INPUT?.symbol == 'DAI' && currencies.OUTPUT?.symbol == 'WETH') ||
                        (currencies.OUTPUT?.symbol == 'DAI' && currencies.INPUT?.symbol == 'WETH')) && (
                        <SwapDetailsDropdown
                          currencyIn={currencies.INPUT}
                          currencyOut={currencies.OUTPUT}
                          routes={routes}
                          trade={trade}
                          syncing={routeIsSyncing}
                          loading={routeIsLoading}
                          allowedSlippage={allowedSlippage}
                        />
                      )}
                  </DetailsSwapSection>
                </div>
                {showPriceImpactWarning && <PriceImpactWarning priceImpact={largerPriceImpact} />}
                <div>
                  {!account ? (
                    <TraceEvent
                      events={[BrowserEvent.onClick]}
                      name={InterfaceEventName.CONNECT_WALLET_BUTTON_CLICKED}
                      properties={{ received_swap_quote: getIsValidSwapQuote(trade, tradeState, swapInputError) }}
                      element={InterfaceElementName.CONNECT_WALLET_BUTTON}
                    >
                      <ButtonLight onClick={toggleWalletModal} fontWeight={600}>
                        <Trans>Connect Wallet</Trans>
                      </ButtonLight>
                    </TraceEvent>
                  ) : showWrap ? (
                    <ButtonPrimary disabled={Boolean(wrapInputError)} onClick={onWrap} fontWeight={600}>
                      {wrapInputError ? (
                        <WrapErrorText wrapInputError={wrapInputError} />
                      ) : wrapType === WrapType.WRAP ? (
                        <Trans>Wrap</Trans>
                      ) : wrapType === WrapType.UNWRAP ? (
                        <Trans>Unwrap</Trans>
                      ) : null}
                    </ButtonPrimary>
                  ) : // eslint-disable-next-line no-constant-condition
                  false ? (
                    // routeNotFound && userHasSpecifiedInputOutput && !routeIsLoading && !routeIsSyncing ? (
                    <GrayCard style={{ textAlign: 'center' }}>
                      <ThemedText.DeprecatedMain mb="4px">
                        <Trans>Insufficient liquidity for this trade.</Trans>
                      </ThemedText.DeprecatedMain>
                    </GrayCard>
                  ) : showApproveFlow ? (
                    <AutoRow style={{ flexWrap: 'nowrap', width: '100%' }}>
                      <AutoColumn style={{ width: '100%' }} gap="12px">
                        <ButtonConfirmed
                          fontWeight={600}
                          onClick={handleApprove}
                          disabled={approveTokenButtonDisabled}
                          width="100%"
                          altDisabledStyle={approvalState === ApprovalState.PENDING} // show solid button while waiting
                          confirmed={
                            approvalState === ApprovalState.APPROVED || signatureState === UseERC20PermitState.SIGNED
                          }
                        >
                          <AutoRow justify="space-between" style={{ flexWrap: 'nowrap' }} height="20px">
                            {/* we need to shorten this string on mobile */}
                            {approvalState === ApprovalState.APPROVED ||
                            signatureState === UseERC20PermitState.SIGNED ? (
                              <ThemedText.SubHeader width="100%" textAlign="center" color="textSecondary">
                                <Trans>You can now trade {currencies[Field.INPUT]?.symbol}</Trans>
                              </ThemedText.SubHeader>
                            ) : (
                              <ThemedText.SubHeader width="100%" textAlign="center" color="white">
                                <Trans>Allow the Uniswap Protocol to use your {currencies[Field.INPUT]?.symbol}</Trans>
                              </ThemedText.SubHeader>
                            )}

                            {approvalPending || approvalState === ApprovalState.PENDING ? (
                              <Loader stroke={theme.white} />
                            ) : (approvalSubmitted && approvalState === ApprovalState.APPROVED) ||
                              signatureState === UseERC20PermitState.SIGNED ? (
                              <CheckCircle size="20" color={theme.accentSuccess} />
                            ) : (
                              <MouseoverTooltip
                                text={
                                  <Trans>
                                    You must give the Uniswap smart contracts permission to use your{' '}
                                    {currencies[Field.INPUT]?.symbol}. You only have to do this once per token.
                                  </Trans>
                                }
                              >
                                <HelpCircle size="20" color={theme.white} style={{ marginLeft: '8px' }} />
                              </MouseoverTooltip>
                            )}
                          </AutoRow>
                        </ButtonConfirmed>
                        <ButtonError
                          onClick={async () => {
                            if (isExpertMode) {
                              handleSwap()
                            } else {
                              await soloPoolContract?.swapExactInput(
                                0,
                                ethers.utils.parseEther(formattedAmounts[Field.INPUT]).toString(),
                                {
                                  gasLimit: '1000000',
                                }
                              )
                            }
                          }}
                          width="100%"
                          id="swap-button"
                          disabled={false}
                          error={isValid && priceImpactSeverity > 2}
                        >
                          <Text fontSize={16} fontWeight={600}>
                            {priceImpactTooHigh ? (
                              <Trans>High Price Impact</Trans>
                            ) : trade && priceImpactSeverity > 2 ? (
                              <Trans>Swap Anyway</Trans>
                            ) : (
                              <Trans>Confirm Swap</Trans>
                            )}
                          </Text>
                        </ButtonError>
                      </AutoColumn>
                    </AutoRow>
                  ) : !isApproved ? (
                    <ButtonPrimary
                      onClick={handleApprove}
                      disabled={isAllowancePending || isApprovalLoading}
                      style={{ gap: 14 }}
                    >
                      {isAllowancePending ? (
                        <>
                          <Loader size="20px" />
                          <Trans>Approve in your wallet</Trans>
                        </>
                      ) : isApprovalLoading ? (
                        <>
                          <Loader size="20px" />
                          <Trans>Approval pending</Trans>
                        </>
                      ) : (
                        <>
                          <div style={{ height: 20 }}>
                            <MouseoverTooltip
                              text={
                                <Trans>
                                  Permission is required for Solo to swap each token. This will expire after one month
                                  for your security.
                                </Trans>
                              }
                            >
                              <Info size={20} />
                            </MouseoverTooltip>
                          </div>
                          <Trans>Approve use of {currencies[Field.INPUT]?.symbol}</Trans>
                        </>
                      )}
                    </ButtonPrimary>
                  ) : (
                    <ButtonError
                      onClick={handleSwap}
                      id="swap-button"
                      disabled={false}
                      error={
                        isValid &&
                        priceImpactSeverity > 2 &&
                        (permit2Enabled ? allowance.state === AllowanceState.ALLOWED : !swapCallbackError)
                      }
                    >
                      <Text fontSize={20} fontWeight={600}>
                        {swapInputError ? (
                          swapInputError
                        ) : priceImpactTooHigh ? (
                          <Trans>Price Impact Too High</Trans>
                        ) : priceImpactSeverity > 2 ? (
                          <Trans>Swap Anyway</Trans>
                        ) : (
                          <Trans>Confirm Swap</Trans>
                        )}
                      </Text>
                    </ButtonError>
                  )}
                  {isExpertMode && swapErrorMessage ? <SwapCallbackError error={swapErrorMessage} /> : null}
                </div>
              </AutoColumn>
            </SwapWrapper>
          )}
          <Modal isOpen={isTxnComplete} $scrollOverlay={true} onDismiss={handleConfirmDismiss} maxHeight={90}>
            <TransactionSubmittedContent
              chainId={80001}
              hash={txnHash}
              onDismiss={handleConfirmDismiss}
              currencyToAdd={currencies[Field.OUTPUT] ?? undefined}
            />
          </Modal>
        </PageWrapper>
        <SwitchLocaleLink />
      </>
    </Trace>
  )
}
