export default function ChallengeIcon(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      className={props.className}
      viewBox="0 0 24 24"
    >
      {/* <path
        fillRule="evenodd"
        d="M7.022 1.566a1.13 1.13 0 0 1 1.96 0l6.857 11.667c.457.778-.092 1.767-.98 1.767H1.144c-.889 0-1.437-.99-.98-1.767L7.022 1.566z"
      /> */}
      <g>
        <polygon points="18.63 15.11 15.37 18.49 3.39 6.44 1.82 1.05 7.02 2.68 18.63 15.11" />
        <polygon points="21.16 13.73 22.26 14.87 19.51 17.72 23 21.35 21.41 23 17.91 19.37 15.16 22.23 14.07 21.09 21.16 13.73" />
      </g>
      <g>
        <polygon points="8.6 18.44 5.34 15.06 16.96 2.63 22.15 1 20.58 6.39 8.6 18.44" />
        <polygon points="9.93 21.07 8.84 22.21 6.09 19.35 2.59 22.98 1 21.33 4.49 17.7 1.74 14.85 2.84 13.71 9.93 21.07" />
      </g>
    </svg>
  )
}

// function ShareIcon(props) {
//   return /*#__PURE__*/ React.createElement(
//     'svg',
//     Object.assign(
//       {
//         xmlns: 'http://www.w3.org/2000/svg',
//         viewBox: '0 0 20 20',
//         fill: 'currentColor',
//         'aria-hidden': 'true',
//       },
//       props
//     ),
//     /*#__PURE__*/ React.createElement('path', {
//       d: 'M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z',
//     })
//   )
// }

// <?xml version="1.0" encoding="UTF-8"?><svg id="Layer_1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><g><polygon points="15.88 12.58 13.13 15.33 3.02 5.53 1.69 1.15 6.08 2.48 15.88 12.58"/><polygon points="18.02 11.47 18.94 12.39 16.62 14.71 19.57 17.66 18.22 19 15.27 16.05 12.95 18.37 12.03 17.45 18.02 11.47"/></g><g><polygon points="7.42 15.29 4.67 12.54 14.47 2.44 18.85 1.11 17.52 5.49 7.42 15.29"/><polygon points="8.53 17.43 7.61 18.36 5.29 16.03 2.34 18.98 1 17.64 3.95 14.69 1.63 12.37 2.55 11.45 8.53 17.43"/></g></svg>
