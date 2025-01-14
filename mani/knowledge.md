mani is a react native app that is built on top of expo. It's the simpler version of the web app. It can import from common/ and client-common/. It cannot import from web/.

Use <Row> and <Col> instead of flexDirection: 'row' and flexDirection: 'column'.
The app uses dark mode only.
We don't use tailwind in this app, instead we use style sheets.
We use expo-router for navigation.

Use <Button> from 'components/buttons/button' instead of <TouchableOpacity> in the case where you want to use a normal-looking button component.
