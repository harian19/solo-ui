import { Trans } from '@lingui/macro'
import { Percent } from '@uniswap/sdk-core'
import styled from 'styled-components/macro'

import { ThemedText } from '../../theme'
import { RowBetween } from '../Row'

const StyledSwapHeader = styled.div`
  padding: 8px 12px;
  margin-bottom: 8px;
  width: 100%;
  color: ${({ theme }) => theme.textSecondary};
`

export default function SwapHeader({ allowedSlippage }: { allowedSlippage: Percent }) {
  return (
    <StyledSwapHeader>
      <RowBetween>
        <ThemedText.DeprecatedBlack
          fontWeight={500}
          fontSize={16}
          style={{ marginRight: '8px', textAlign: 'center', minWidth: '100%' }}
        >
          <Trans>Swap</Trans>
        </ThemedText.DeprecatedBlack>
      </RowBetween>
    </StyledSwapHeader>
  )
}
