import { Trace } from '@uniswap/analytics'
import { InterfacePageName } from '@uniswap/analytics-events'
/* eslint-disable import/no-unused-modules */
import { InterfaceElementName } from '@uniswap/analytics-events'
import { useWeb3React } from '@web3-react/core'
import WETH_ABI from 'abis/solo/WETH_solo.json'
import Card, { CardType } from 'components/About/Card'
import darkArrowImgSrc from 'components/About/images/aboutArrowDark.png'
import lightArrowImgSrc from 'components/About/images/aboutArrowLight.png'
import darkDollarImgSrc from 'components/About/images/aboutDollarDark.png'
import darkTerminalImgSrc from 'components/About/images/aboutTerminalDark.png'
import { BaseButton } from 'components/Button'
import { RowBetween } from 'components/Row'
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { ethers } from 'ethers'
import Swap from 'pages/Swap'
import { parse } from 'qs'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownCircle } from 'react-feather'
import { DollarSign, Terminal } from 'react-feather'
import { useLocation, useNavigate } from 'react-router-dom'
import { Link as NativeLink } from 'react-router-dom'
import { useAppSelector } from 'state/hooks'
import { useIsDarkMode } from 'state/user/hooks'
import styled, { css } from 'styled-components/macro'
import { ThemedText } from 'theme'
import { BREAKPOINTS } from 'theme'
import { lightTheme } from 'theme/colors'
import { Z_INDEX } from 'theme/zIndex'

const StyledCardLogo = styled.img`
  min-width: 20px;
  min-height: 20px;
  max-height: 48px;
  max-width: 48px;
`

const PageContainer = styled.div<{ isDarkMode: boolean }>`
  position: absolute;
  top: 0;
  padding: ${({ theme }) => theme.navHeight}px 0px 0px 0px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  scroll-behavior: smooth;
  overflow-x: hidden;

  background: ${({ isDarkMode }) =>
    isDarkMode ? '#141414' : 'linear-gradient(rgba(255, 255, 255, 0) 0%, rgb(255 255 255 /100%) 45%)'};
`

const TitleRow = styled(RowBetween)`
  color: ${({ theme }) => theme.textSecondary};
  ${({ theme }) => theme.deprecated_mediaWidth.deprecated_upToSmall`
    flex-wrap: wrap;
    gap: 12px;
    width: 100%;
  `};
`

const Gradient = styled.div<{ isDarkMode: boolean }>`
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  top: 0;
  bottom: 0;
  width: 100%;
  min-height: 550px;
  background: ${({ isDarkMode }) =>
    isDarkMode
      ? 'linear-gradient(rgba(8, 10, 24, 0) 0%, rgb(8 10 24 / 100%) 45%)'
      : 'linear-gradient(rgba(255, 255, 255, 0) 0%, rgb(255 255 255 /100%) 45%)'};
  z-index: ${Z_INDEX.under_dropdown};
  pointer-events: none;
  height: ${({ theme }) => `calc(100vh - ${theme.mobileBottomBarHeight}px)`};
  @media screen and (min-width: ${({ theme }) => theme.breakpoint.md}px) {
    height: 100vh;
  }
`

const GlowContainer = styled.div`
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  top: 0;
  bottom: 0;
  width: 100%;
  overflow-y: hidden;
  height: ${({ theme }) => `calc(100vh - ${theme.mobileBottomBarHeight}px)`};
  @media screen and (min-width: ${({ theme }) => theme.breakpoint.md}px) {
    height: 100vh;
  }
`

const Glow = styled.div`
  position: absolute;
  top: 68px;
  bottom: 0;
  background: radial-gradient(72.04% 72.04% at 50% 3.99%, #ff37eb 0%, rgba(166, 151, 255, 0) 100%);
  filter: blur(72px);
  border-radius: 24px;
  max-width: 480px;
  width: 100%;
  height: 100%;
`

const ContentContainer = styled.div<{ isDarkMode: boolean }>`
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  width: 100%;
  padding: 0 0 40px;
  max-width: min(720px, 90%);
  min-height: 500px;
  z-index: ${Z_INDEX.under_dropdown};
  transition: ${({ theme }) => `${theme.transition.duration.medium} ${theme.transition.timing.ease} opacity`};
  height: ${({ theme }) => `calc(100vh - ${theme.navHeight + theme.mobileBottomBarHeight}px)`};
  pointer-events: none;
  * {
    pointer-events: auto;
  }
`

const TitleText = styled.h1<{ isDarkMode: boolean }>`
  color: transparent;
  font-size: 36px;
  line-height: 44px;
  font-weight: 700;
  text-align: center;
  margin: 0 0 24px;
  background: ${({ isDarkMode }) =>
    isDarkMode
      ? 'linear-gradient(20deg, rgba(255, 244, 207, 1) 10%, rgba(255, 87, 218, 1) 100%)'
      : 'linear-gradient(10deg, rgba(255,79,184,1) 0%, rgba(255,159,251,1) 100%)'};
  background-clip: text;
  -webkit-background-clip: text;

  @media screen and (min-width: ${BREAKPOINTS.sm}px) {
    font-size: 48px;
    line-height: 56px;
  }

  @media screen and (min-width: ${BREAKPOINTS.md}px) {
    font-size: 64px;
    line-height: 72px;
  }
`

const SubText = styled.div`
  color: ${({ theme }) => theme.textSecondary};
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  text-align: center;
  max-width: 600px;
  margin: 0 0 32px;

  @media screen and (min-width: ${BREAKPOINTS.md}px) {
    font-size: 20px;
    line-height: 28px;
  }
`

const SubTextContainer = styled.div`
  display: flex;
  justify-content: center;
`

const LandingButton = styled(BaseButton)`
  padding: 16px 0px;
  border-radius: 24px;
`

const ButtonCTA = styled(LandingButton)`
  background: #d6d5d6;
  border: none;
  color: #141414;
  transition: ${({ theme }) => `all ${theme.transition.duration.medium} ${theme.transition.timing.ease}`};

  &:hover {
    box-shadow: 0px 0px 16px 0px #9c9b9c;
  }
`

const ButtonCTAText = styled.p`
  margin: 0px;
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;

  @media screen and (min-width: ${BREAKPOINTS.sm}px) {
    font-size: 20px;
  }
`

const ActionsContainer = styled.span`
  max-width: 300px;
  width: 100%;
  pointer-events: auto;
`

const LearnMoreContainer = styled.div`
  align-items: center;
  color: ${({ theme }) => theme.textTertiary};
  cursor: pointer;
  font-size: 20px;
  font-weight: 600;
  margin: 36px 0 0;
  display: flex;
  visibility: hidden;
  pointer-events: auto;
  @media screen and (min-width: ${BREAKPOINTS.sm}px) {
    visibility: visible;
  }

  transition: ${({ theme }) => `${theme.transition.duration.medium} ${theme.transition.timing.ease} opacity`};

  &:hover {
    opacity: 0.6;
  }
`

const LearnMoreArrow = styled(ArrowDownCircle)`
  margin-left: 14px;
  size: 20px;
`

const AboutContentContainer = styled.div<{ isDarkMode: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 24px 5rem;
  width: 100%;
  background: ${({ isDarkMode }) =>
    isDarkMode ? '#141414' : 'linear-gradient(179.82deg, rgba(255, 255, 255, 0) 0.16%, #eaeaea 99.85%)'};
  @media screen and (min-width: ${BREAKPOINTS.md}px) {
    padding: 0 96px 5rem;
  }
`

const CardGrid = styled.div<{ cols: number }>`
  display: grid;
  gap: 12px;
  width: 100%;
  padding: 24px 0 0;
  max-width: 1440px;
  scroll-margin: ${({ theme }) => `${theme.navHeight}px 0 0`};

  grid-template-columns: 1fr;
  @media screen and (min-width: ${BREAKPOINTS.sm}px) {
    // At this screen size, we show up to 2 columns.
    grid-template-columns: ${({ cols }) =>
      Array.from(Array(cols === 2 ? 2 : 1))
        .map(() => '1fr')
        .join(' ')};
    gap: 32px;
  }

  @media screen and (min-width: ${BREAKPOINTS.lg}px) {
    // at this screen size, always show the max number of columns
    grid-template-columns: ${({ cols }) =>
      Array.from(Array(cols))
        .map(() => '1fr')
        .join(' ')};
    gap: 32px;
  }
`

const LandingSwapContainer = styled.div`
  height: ${({ theme }) => `calc(100vh - ${theme.mobileBottomBarHeight}px)`};
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 1;
`

const SwapCss = css`
  * {
    pointer-events: none;
  }

  &:hover {
    transform: translateY(-4px);
    transition: ${({ theme }) => `transform ${theme.transition.duration.medium} ${theme.transition.timing.ease}`};
  }
`

const LinkCss = css`
  text-decoration: none;
  max-width: 480px;
  width: 100%;
`

const LandingSwap = styled(Swap)`
  ${SwapCss}
  &:hover {
    border: 1px solid ${({ theme }) => theme.accentAction};
  }
`

const Link = styled(NativeLink)`
  ${LinkCss}
`

const WidgetLandingLink = styled(NativeLink)`
  ${LinkCss}
  ${SwapCss}
`

export default function Demo() {
  const isDarkMode = useIsDarkMode()

  const cardsRef = useRef<HTMLDivElement>(null)

  const [showContent, setShowContent] = useState(false)
  const selectedWallet = useAppSelector((state) => state.user.selectedWallet)
  const navigate = useNavigate()
  const location = useLocation()
  const queryParams = parse(location.search, {
    ignoreQueryPrefix: true,
  })

  const { account, provider } = useWeb3React()
  const signer = provider?.getSigner()
  const wethContract = new ethers.Contract('0xCC57bcE47D2d624668fe1A388758fD5D91065d33', WETH_ABI, signer)
  const daiContract = new ethers.Contract('0xB704143D415d6a3a9e851DA5e76B64a5D99d718b', WETH_ABI, signer)

  const handleFaucetCall = useCallback(() => {
    try {
      wethContract.mint(signer?.getAddress(), ethers.utils.parseEther('0.5'))
      daiContract.mint(signer?.getAddress(), ethers.utils.parseEther('500'))
    } catch (e) {
      console.error(e)
    }
  }, [daiContract, signer, wethContract])

  const MORE_CARDS = [
    {
      to: 'https://www.alchemy.com/overviews/mumbai-testnet#how-to-get-started-using-the-mumbai-testnet',
      external: true,
      title: '1. Connect Wallet',
      description: 'Connect your wallet to our Dapp on Mumbai testnet ',
      lightIcon: <Terminal color={lightTheme.textTertiary} size={48} />,
      darkIcon: <StyledCardLogo src={darkTerminalImgSrc} alt="Developers" />,
      cta: 'Instructions',
      elementName: InterfaceElementName.ABOUT_PAGE_DEV_DOCS_CARD,
    },
    {
      onClick: handleFaucetCall,
      external: true,
      title: '2. Get tokens',
      description: 'Use our faucet to load your wallet with tokens.',
      lightIcon: <DollarSign color={lightTheme.textTertiary} size={48} />,
      darkIcon: <StyledCardLogo src={darkDollarImgSrc} alt="Earn" />,
      cta: 'Get WETH & DAI',
      elementName: InterfaceElementName.ABOUT_PAGE_BUY_CRYPTO_CARD,
    },
    {
      to: '/earn',
      title: '3. Earn',
      description: 'Provide liquidity on Solo and earn.',
      lightIcon: <StyledCardLogo src={lightArrowImgSrc} alt="Analytics" />,
      darkIcon: <StyledCardLogo src={darkDollarImgSrc} alt="Analytics" />,
      cta: 'Provide liquidity',
      elementName: InterfaceElementName.ABOUT_PAGE_EARN_CARD,
    },
    {
      to: '/swap',
      title: '4. Swap',
      description: 'Trade on Solo and swap tokens.',
      lightIcon: <StyledCardLogo src={lightArrowImgSrc} alt="Analytics" />,
      darkIcon: <StyledCardLogo src={darkArrowImgSrc} alt="Analytics" />,
      cta: 'Swap',
      elementName: InterfaceElementName.ABOUT_PAGE_EARN_CARD,
    },
  ]

  // This can be simplified significantly once the flag is removed! For now being explicit is clearer.
  useEffect(() => {
    // if (queryParams.intro || !selectedWallet) {
    setShowContent(true)
    // } else {
    // navigate('/swap')
    // }
  }, [navigate, selectedWallet, queryParams.intro])

  return (
    <Trace page={InterfacePageName.LANDING_PAGE} shouldLogImpression>
      {showContent && (
        <PageContainer isDarkMode={isDarkMode} data-testid="landing-page">
          <AboutContentContainer isDarkMode={isDarkMode}>
            <TitleRow padding="0">
              <ThemedText.DeprecatedLargeHeader style={{ width: '100%', textAlign: 'center', margin: '40px' }}>
                ETHDenver Instructions
              </ThemedText.DeprecatedLargeHeader>
            </TitleRow>
            <CardGrid cols={2}>
              {MORE_CARDS.map(({ darkIcon, lightIcon, onClick, ...card }) => (
                <Card
                  {...card}
                  icon={isDarkMode ? darkIcon : lightIcon}
                  key={card.title}
                  type={CardType.Secondary}
                  onClick={onClick}
                />
              ))}
            </CardGrid>
          </AboutContentContainer>
        </PageContainer>
      )}
    </Trace>
  )
}
