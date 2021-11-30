# Austin's Starter Project Template

## Usage

1. Clone this repository
2. `yarn`
3. `yarn dev` to start development
4. Setup Firebase

## Setting up Firebase

1. Go to https://console.firebase.google.com/ and create a new project
1. Go to Project Settings and add Firebase to your web app
   a. Copy firebaseConfig to `src/network/init.ts`
1. Create a Firestore Database
   a. Create a new collection called `users`
   b. Set up the security rules (see `src/network/example-rules.txt`)

1. Enable Authetication & Google auth

## Built on top of

- [VueJS](https://v3.vuejs.org/guide/introduction.html) on the frontend
- [Vite](https://vitejs.dev/) for bundling and serving
- [TailwindCSS](https://tailwindcss.com/) for styling
  - [WindiCSS](https://windicss.org/) specifically for faster loading times
  - [DaisyUI](https://daisyui.com/) for a default set of components
- [Firestore](https://firebase.google.com/docs/firestore) for the database
- [Firebase Auth](https://firebase.google.com/docs/auth) for login

### TODOs:

- [Netlify](https://www.netlify.com/) for hosting
- [Stripe](https://stripe.com/) for payments
- [Mailjet](https://www.mailjet.com/) for marketing & transactional emails
