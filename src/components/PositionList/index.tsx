import { Trans } from '@lingui/macro'
import { ButtonSecondary } from 'components/Button'
import { DarkCard } from 'components/Card'
import DoubleCurrencyLogo from 'components/DoubleLogo'
import { useCurrency } from 'hooks/Tokens'
import React from 'react'
import styled from 'styled-components/macro'
import { MEDIA_WIDTHS } from 'theme'

const DesktopHeader = styled.div`
  display: none;
  font-size: 14px;
  font-weight: 500;
  padding: 16px;
  border-bottom: 1px solid ${({ theme }) => theme.backgroundOutline};

  @media screen and (min-width: ${MEDIA_WIDTHS.deprecated_upToSmall}px) {
    align-items: center;
    display: flex;
    justify-content: space-between;
    & > div:last-child {
      text-align: right;
      margin-right: 12px;
    }
  }
`

const TokenLogo = styled.img<{ size: string }>`
  width: ${({ size }) => size};
  height: ${({ size }) => size};
  background: radial-gradient(white 60%, #ffffff00 calc(70% + 1px));
  border-radius: 50%;
  box-shadow: 0 0 1px white;
  vertical-align: middle;
`

const MobileHeader = styled.div`
  font-weight: medium;
  padding: 8px;
  font-weight: 500;
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid ${({ theme }) => theme.backgroundOutline};

  @media screen and (min-width: ${MEDIA_WIDTHS.deprecated_upToSmall}px) {
    display: none;
  }

  @media screen and (max-width: ${MEDIA_WIDTHS.deprecated_upToExtraSmall}px) {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
  }
`

const ToggleWrap = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
`

const ToggleLabel = styled.button`
  cursor: pointer;
  background-color: transparent;
  border: none;
  color: ${({ theme }) => theme.accentAction};
  font-size: 1rem;
`

type PositionListProps = React.PropsWithChildren<{
  deposits: { logoURI: string; value: string; symbol: string; name: string }[]
  setUserHideClosedPositions: any
  userHideClosedPositions: boolean
  handleWithdraw: () => void
}>

export default function PositionList({
  deposits,
  setUserHideClosedPositions,
  userHideClosedPositions,
  handleWithdraw,
}: PositionListProps) {
  const currency0 = useCurrency('0xCC57bcE47D2d624668fe1A388758fD5D91065d33')
  const currency1 = useCurrency('0xB704143D415d6a3a9e851DA5e76B64a5D99d718b')

  return (
    <>
      <DesktopHeader>
        <div style={{ display: 'flex', fontSize: '16px' }}>
          {currency0 && currency1 && (
            <DoubleCurrencyLogo currency0={currency0} currency1={currency1} margin={true} size={25} />
          )}
          <span style={{ margin: '4px' }}>DAI-WETH position</span>
        </div>

        <ToggleLabel
          id="desktop-hide-closed-positions"
          onClick={() => {
            setUserHideClosedPositions(!userHideClosedPositions)
          }}
        ></ToggleLabel>
      </DesktopHeader>
      <MobileHeader>
        {currency0 && currency1 && (
          <DoubleCurrencyLogo currency0={currency0} currency1={currency1} margin={true} size={20} />
        )}
        <Trans>DAI-WETH position</Trans>
        <ToggleWrap>
          <ToggleLabel
            onClick={() => {
              setUserHideClosedPositions(!userHideClosedPositions)
            }}
          ></ToggleLabel>
        </ToggleWrap>
      </MobileHeader>
      <DarkCard style={{ padding: '0.6rem' }}>
        <div
          style={{
            backgroundColor: '#141414',
            borderRadius: '12px',
          }}
        >
          {deposits.map((d) => {
            return (
              <div
                key={d.symbol}
                style={{
                  textAlign: 'center',
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '40px',
                  fontSize: '20px',
                  height: '90px',
                }}
              >
                <TokenLogo size="48px" alt="token logo" src={d.logoURI} style={{ float: 'left' }} />
                <span>{d.name}</span>
                {parseFloat(d.value).toFixed(2)} {d.symbol}
              </div>
            )
          })}
          {/* <ButtonOutlined
            onClick={() => {
              return
            }}
            padding="2"
            style={{ float: 'right', display: 'inline-block', margin: '10px', borderRadius: '12px' }}
            width="150px"
          >
            Track Rewards
          </ButtonOutlined> */}
          <ButtonSecondary
            onClick={handleWithdraw}
            padding="2"
            style={{ float: 'right', display: 'inline-block', margin: '10px' }}
            width="150px"
          >
            Withdraw
          </ButtonSecondary>
        </div>
      </DarkCard>
    </>
  )
}
