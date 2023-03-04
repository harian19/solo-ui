import { Trans } from '@lingui/macro'
import { ButtonSecondary } from 'components/Button'
import { DarkCard } from 'components/Card'
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
  deposits: { logoURI: string; value: string; symbol: string }[]
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
  return (
    <>
      <DesktopHeader>
        <div>
          <Trans>Your positions</Trans>
          {deposits && ' (' + deposits.length + ')'}
        </div>

        <ToggleLabel
          id="desktop-hide-closed-positions"
          onClick={() => {
            setUserHideClosedPositions(!userHideClosedPositions)
          }}
        ></ToggleLabel>
      </DesktopHeader>
      <MobileHeader>
        <Trans>Your positions</Trans>
        <ToggleWrap>
          <ToggleLabel
            onClick={() => {
              setUserHideClosedPositions(!userHideClosedPositions)
            }}
          ></ToggleLabel>
        </ToggleWrap>
      </MobileHeader>
      {deposits.map((d) => {
        return (
          <DarkCard style={{ padding: '0.6rem' }} key={d.symbol}>
            <div
              style={{
                textAlign: 'center',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-around',
                fontSize: '20px',
                backgroundColor: '#141414',
                borderRadius: '12px',
                height: '90px',
              }}
            >
              <TokenLogo size="48px" alt="token logo" src={d.logoURI} style={{ float: 'left' }} />
              {parseFloat(d.value).toFixed(3)} {d.symbol}
              {/* <ButtonPrimary
                as={Link}
                style={{ borderRadius: '12px', padding: '4px', display: 'inline-block', margin: '10px' }}
                width="150px"
                to="/add/0xB704143D415d6a3a9e851DA5e76B64a5D99d718b"
                disabled={d.symbol == 'WETH'}
              >
                Deposit
              </ButtonPrimary> */}
              <ButtonSecondary
                onClick={handleWithdraw}
                padding="2"
                style={{ display: 'inline-block', margin: '10px' }}
                width="150px"
              >
                Withdraw
              </ButtonSecondary>
            </div>
          </DarkCard>
        )
      })}
    </>
  )
}
