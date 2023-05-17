import { runScript } from 'run-script'

const apiKey = 'YOUR_API_KEY'
const url = `https://newsapi.org/v2/top-headlines?country=us&apiKey=${apiKey}`

const processNews = async () => {
  await fetch(url)
    .then((response) => response.json())
    .then((data) => {
      const articles = data.articles
      console.log(articles)
    })
    .catch((error) => {
      console.error(error)
    })
}

if (require.main === module) {
  runScript(async ({ pg }) => {
    await processNews()
  })
}
