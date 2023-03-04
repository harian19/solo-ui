import { Trans } from '@lingui/macro'
import { Trace, TraceEvent } from '@uniswap/analytics'
import { BrowserEvent, InterfaceElementName, InterfaceEventName, InterfacePageName } from '@uniswap/analytics-events'
import { useWeb3React } from '@web3-react/core'
import SOLO_WETH_DAI_ABI from 'abis/solo/SoloWETHDAIPool.json'
import WETH_ABI from 'abis/solo/WETH_solo.json'
import { ButtonGray, ButtonPrimary, ButtonText } from 'components/Button'
import { AutoColumn } from 'components/Column'
import { FlyoutAlignment, Menu } from 'components/Menu'
import PositionList from 'components/PositionList'
import { RowBetween, RowFixed } from 'components/Row'
import { SwitchLocaleLink } from 'components/SwitchLocaleLink'
import { isSupportedChain } from 'constants/chains'
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { ethers } from 'ethers'
import { useV3Positions } from 'hooks/useV3Positions'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BookOpen, ChevronDown, ChevronsRight, Inbox, Layers, PlusCircle } from 'react-feather'
import { Link } from 'react-router-dom'
import { useToggleWalletModal } from 'state/application/hooks'
import { useUserHideClosedPositions } from 'state/user/hooks'
import styled, { css, useTheme } from 'styled-components/macro'
import { HideSmall, ThemedText } from 'theme'
import { PositionDetails } from 'types/position'

import { V2_FACTORY_ADDRESSES } from '../../constants/addresses'
import { LoadingRows } from './styleds'

const PageWrapper = styled(AutoColumn)`
  padding: 68px 8px 0px;
  max-width: 870px;
  width: 100%;

  ${({ theme }) => theme.deprecated_mediaWidth.deprecated_upToMedium`
    max-width: 800px;
  `};

  ${({ theme }) => theme.deprecated_mediaWidth.deprecated_upToSmall`
    max-width: 500px;
  `};

  @media only screen and (max-width: ${({ theme }) => `${theme.breakpoint.md}px`}) {
    padding-top: 48px;
  }

  @media only screen and (max-width: ${({ theme }) => `${theme.breakpoint.sm}px`}) {
    padding-top: 20px;
  }
`
const TitleRow = styled(RowBetween)`
  color: ${({ theme }) => theme.textSecondary};
  ${({ theme }) => theme.deprecated_mediaWidth.deprecated_upToSmall`
    flex-wrap: wrap;
    gap: 12px;
    width: 100%;
  `};
`
const ButtonRow = styled(RowFixed)`
  & > *:not(:last-child) {
    margin-left: 8px;
  }

  ${({ theme }) => theme.deprecated_mediaWidth.deprecated_upToSmall`
    width: 100%;
    flex-direction: row;
    justify-content: space-between;
    flex-direction: row-reverse;
  `};
`
const PoolMenu = styled(Menu)`
  margin-left: 0;
  ${({ theme }) => theme.deprecated_mediaWidth.deprecated_upToSmall`
    flex: 1 1 auto;
    width: 49%;
    right: 0px;
  `};

  a {
    width: 100%;
  }
`
const PoolMenuItem = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
  width: 100%;
  font-weight: 500;
`
const MoreOptionsButton = styled(ButtonGray)`
  border-radius: 12px;
  flex: 1 1 auto;
  padding: 6px 8px;
  width: 100%;
  background-color: ${({ theme }) => theme.backgroundSurface};
  margin-right: 8px;
`

const MoreOptionsText = styled(ThemedText.DeprecatedBody)`
  align-items: center;
  display: flex;
`

const ErrorContainer = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin: auto;
  max-width: 300px;
  min-height: 25vh;
`

const IconStyle = css`
  width: 48px;
  height: 48px;
  margin-bottom: 0.5rem;
`

const NetworkIcon = styled(AlertTriangle)`
  ${IconStyle}
`

const InboxIcon = styled(Inbox)`
  ${IconStyle}
`

const ResponsiveButtonPrimary = styled(ButtonPrimary)`
  border-radius: 12px;
  font-size: 16px;
  padding: 6px 8px;
  width: fit-content;
  ${({ theme }) => theme.deprecated_mediaWidth.deprecated_upToSmall`
    flex: 1 1 auto;
    width: 100%;
  `};
`

const MainContentWrapper = styled.main`
  background-color: ${({ theme }) => theme.backgroundSurface};
  border: 1px solid ${({ theme }) => theme.backgroundOutline};
  padding: 0;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0px 0px 1px rgba(0, 0, 0, 0.01), 0px 4px 8px rgba(0, 0, 0, 0.04), 0px 16px 24px rgba(0, 0, 0, 0.04),
    0px 24px 32px rgba(0, 0, 0, 0.01);
`

function PositionsLoadingPlaceholder() {
  return (
    <LoadingRows>
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
    </LoadingRows>
  )
}

function WrongNetworkCard() {
  const theme = useTheme()

  return (
    <>
      <PageWrapper>
        <AutoColumn gap="lg" justify="center">
          <AutoColumn gap="lg" style={{ width: '100%' }}>
            <TitleRow padding="0">
              <ThemedText.DeprecatedLargeHeader>
                <Trans>Positions</Trans>
              </ThemedText.DeprecatedLargeHeader>
            </TitleRow>

            <MainContentWrapper>
              <ErrorContainer>
                <ThemedText.DeprecatedBody color={theme.textTertiary} textAlign="center">
                  <NetworkIcon strokeWidth={1.2} />
                  <div data-testid="pools-unsupported-err">
                    <Trans>Your connected network is unsupported.</Trans>
                  </div>
                </ThemedText.DeprecatedBody>
              </ErrorContainer>
            </MainContentWrapper>
          </AutoColumn>
        </AutoColumn>
      </PageWrapper>
      <SwitchLocaleLink />
    </>
  )
}

export default function Pool() {
  const { account, chainId, provider } = useWeb3React()
  const toggleWalletModal = useToggleWalletModal()

  const theme = useTheme()
  const [userHideClosedPositions, setUserHideClosedPositions] = useUserHideClosedPositions()

  const signer = provider?.getSigner()
  const wethContract = new ethers.Contract('0xCC57bcE47D2d624668fe1A388758fD5D91065d33', WETH_ABI, signer)
  const daiContract = new ethers.Contract('0xB704143D415d6a3a9e851DA5e76B64a5D99d718b', WETH_ABI, signer)

  const soloPoolContract = new ethers.Contract('0xF2EEd1CB7c599f9191eCE6E30f1e8339d8a20155', SOLO_WETH_DAI_ABI, signer)

  const soloPoolContractStatic = new ethers.Contract(
    '0xF2EEd1CB7c599f9191eCE6E30f1e8339d8a20155',
    SOLO_WETH_DAI_ABI,
    provider
  )

  const [deposits, setDeposits] = useState<{ logoURI: string; value: string; symbol: string; name: string }[]>([])

  const fetchDeposits = useCallback(async () => {
    const userAddress = await signer?.getAddress()
    const deps = await soloPoolContractStatic.balanceOf(userAddress)
    const depositsCall = await soloPoolContract.callStatic.withdraw(deps, userAddress)
    setDeposits([
      {
        logoURI:
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png',
        value: ethers.utils.formatEther(depositsCall[0]),
        symbol: 'DAI',
        name: 'DAI',
      },
      {
        logoURI:
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
        value: ethers.utils.formatEther(depositsCall[1]),
        symbol: 'WETH',
        name: 'Wrapped Ether',
      },
    ])
  }, [signer, soloPoolContract.callStatic, soloPoolContractStatic])

  const handleWithdraw = useCallback(async () => {
    try {
      const userAddress = await signer?.getAddress()
      const deps = await soloPoolContractStatic.balanceOf(userAddress)
      await soloPoolContract.withdraw(deps, userAddress)
    } catch (e) {
      console.error(e)
    }
  }, [signer, soloPoolContract, soloPoolContractStatic])

  const { positions, loading: positionsLoading } = useV3Positions(account)

  const [openPositions, closedPositions] = positions?.reduce<[PositionDetails[], PositionDetails[]]>(
    (acc, p) => {
      acc[p.liquidity?.isZero() ? 1 : 0].push(p)
      return acc
    },
    [[], []]
  ) ?? [[], []]

  const showConnectAWallet = Boolean(!account)

  useEffect(() => {
    if (showConnectAWallet) return
    try {
      fetchDeposits()
    } catch (e) {
      console.error(e)
    }
  }, [fetchDeposits, showConnectAWallet])

  const filteredPositions = useMemo(
    () => [...openPositions, ...(userHideClosedPositions ? [] : closedPositions)],
    [closedPositions, openPositions, userHideClosedPositions]
  )

  if (!isSupportedChain(chainId)) {
    return <WrongNetworkCard />
  }

  const showV2Features = Boolean(V2_FACTORY_ADDRESSES[chainId])

  const menuItems = [
    {
      content: (
        <PoolMenuItem>
          <Trans>Create a pool</Trans>
          <PlusCircle size={16} />
        </PoolMenuItem>
      ),
      link: '/add/ETH',
      external: false,
    },
    {
      content: (
        <PoolMenuItem>
          <Trans>Migrate</Trans>
          <ChevronsRight size={16} />
        </PoolMenuItem>
      ),
      link: '/migrate/v2',
      external: false,
    },
    {
      content: (
        <PoolMenuItem>
          <Trans>V2 liquidity</Trans>
          <Layers size={16} />
        </PoolMenuItem>
      ),
      link: '/pool/v2',
      external: false,
    },
    {
      content: (
        <PoolMenuItem>
          <Trans>Learn</Trans>
          <BookOpen size={16} />
        </PoolMenuItem>
      ),
      link: 'https://docs.uniswap.org/',
      external: true,
    },
  ]

  return (
    <Trace page={InterfacePageName.POOL_PAGE} shouldLogImpression>
      <PageWrapper>
        <AutoColumn gap="lg" justify="center">
          <AutoColumn gap="lg" style={{ width: '100%' }}>
            <TitleRow padding="0">
              <ThemedText.DeprecatedLargeHeader>
                <Trans>Positions</Trans>
              </ThemedText.DeprecatedLargeHeader>
              <ButtonRow>
                {showV2Features && (
                  <PoolMenu
                    menuItems={menuItems}
                    flyoutAlignment={FlyoutAlignment.LEFT}
                    ToggleUI={(props: any) => (
                      <MoreOptionsButton {...props}>
                        <MoreOptionsText>
                          <Trans>More</Trans>
                          <ChevronDown size={15} />
                        </MoreOptionsText>
                      </MoreOptionsButton>
                    )}
                  />
                )}
                <ResponsiveButtonPrimary data-cy="join-pool-button" id="join-pool-button" as={Link} to="/earn">
                  + <Trans>New Position</Trans>
                </ResponsiveButtonPrimary>
              </ButtonRow>
            </TitleRow>

            <MainContentWrapper>
              {positionsLoading ? (
                <PositionsLoadingPlaceholder />
              ) : deposits.length > 0 ? (
                <>
                  <PositionList
                    handleWithdraw={handleWithdraw}
                    deposits={deposits}
                    setUserHideClosedPositions={setUserHideClosedPositions}
                    userHideClosedPositions={userHideClosedPositions}
                  />
                </>
              ) : (
                <ErrorContainer>
                  <ThemedText.DeprecatedBody color={theme.textTertiary} textAlign="center">
                    <InboxIcon strokeWidth={1} style={{ marginTop: '2em' }} />
                    <div>
                      <Trans>Your active deposits will appear here.</Trans>
                    </div>
                  </ThemedText.DeprecatedBody>
                  {!showConnectAWallet && closedPositions.length > 0 && (
                    <ButtonText
                      style={{ marginTop: '.5rem' }}
                      onClick={() => setUserHideClosedPositions(!userHideClosedPositions)}
                    >
                      <Trans>Show closed positions</Trans>
                    </ButtonText>
                  )}
                  {showConnectAWallet && (
                    <TraceEvent
                      events={[BrowserEvent.onClick]}
                      name={InterfaceEventName.CONNECT_WALLET_BUTTON_CLICKED}
                      properties={{ received_swap_quote: false }}
                      element={InterfaceElementName.CONNECT_WALLET_BUTTON}
                    >
                      <ButtonPrimary
                        style={{ marginTop: '2em', marginBottom: '2em', padding: '8px 16px' }}
                        onClick={toggleWalletModal}
                      >
                        <Trans>Connect a wallet</Trans>
                      </ButtonPrimary>
                    </TraceEvent>
                  )}
                </ErrorContainer>
              )}
            </MainContentWrapper>
            <HideSmall>{/* <CTACards /> */}</HideSmall>
          </AutoColumn>
        </AutoColumn>
      </PageWrapper>
      <SwitchLocaleLink />
    </Trace>
  )
}
