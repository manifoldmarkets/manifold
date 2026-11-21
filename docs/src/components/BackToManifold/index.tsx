import React from 'react'

export default function BackToManifold({
  href = 'https://manifold.markets',
  label = 'Back to Manifold',
}: {
  href?: string
  label?: string
}) {
  return (
    <a
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 16px',
        marginBottom: '16px',
        backgroundColor: '#4337C9',
        color: '#fff',
        borderRadius: '8px',
        textDecoration: 'none',
        fontWeight: 600,
        fontSize: '14px',
      }}
    >
      <span style={{ fontSize: '18px' }}>&larr;</span>
      {label}
    </a>
  )
}
