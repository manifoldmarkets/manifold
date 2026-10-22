import { escapeHtmlAttribute } from './html'

describe('escapeHtmlAttribute', () => {
  it('escapes characters that can terminate or alter an HTML attribute', () => {
    expect(escapeHtmlAttribute(`A & "B" <frame> 'test'`)).toBe(
      'A &amp; &quot;B&quot; &lt;frame&gt; &#39;test&#39;'
    )
  })

  it('leaves ordinary market questions unchanged', () => {
    expect(escapeHtmlAttribute('Will BTC exceed $100k?')).toBe(
      'Will BTC exceed $100k?'
    )
  })
})
