mode = 'PLAY'
allData = {}
total = 0
cardNames = []
k = 12
extra = 3
artDict = {}
totalCorrect = 0
totalSeen = 0
wordsLeft = k + extra
imagesLeft = k
maxRounds = 20
whichGuesser = 'counterspell'
un = false
online = false
firstPrint = false
flag = true
page = 1
sets = {}

window.console.log(sets)
document.location.search.split('&').forEach((pair) => {
  let v = pair.split('=')
  if (v[0] === '?whichguesser') {
    whichGuesser = v[1]
  } else if (v[0] === 'un') {
    un = v[1]
  } else if (v[0] === 'digital') {
    online = v[1]
  } else if (v[0] === 'original') {
    firstPrint = v[1]
  }
})

if (whichGuesser === 'basic') {
  fetch('jsons/set.json')
    .then((response) => response.json())
    .then((data) => (sets = data))
}

let firstFetch = fetch('jsons/' + whichGuesser + '.json')
fetchToResponse(firstFetch)

function putIntoMapAndFetch(data) {
  putIntoMap(data.data)
  if (whichGuesser == 'artist') {
    newArtistData = createNewArtistMap()
    allData = newArtistData[0]
    total = newArtistData[1]
  }
  cardNames = Array.from(Object.keys(allData))
  window.console.log(allData)
  window.console.log(total)
  if (whichGuesser === 'counterspell') {
    document.getElementById('guess-type').innerText = 'Counterspell Guesser'
  } else if (whichGuesser === 'burn') {
    document.getElementById('guess-type').innerText = 'Match With Hot Singles'
  } else if (whichGuesser === 'beast') {
    document.getElementById('guess-type').innerText = 'Finding Fantastic Beasts'
  } else if (whichGuesser === 'basic') {
    document.getElementById('guess-type').innerText = 'How Basic'
  } else if (whichGuesser === 'commander') {
    document.getElementById('guess-type').innerText = 'General Knowledge'
  } else if (whichGuesser === 'artist') {
    document.getElementById('guess-type').innerText = 'Aesthetic Consultation'
  }
  window.console.log(whichGuesser)
  setUpNewGame()
}

function getKSamples() {
  let usedCounters = new Set()
  let samples = {}
  let i = 0
  let allCards = Array.from(Object.keys(allData))
  shuffleArray(allCards)
  window.console.log(allCards)
  for (let j = 0; j < allCards.length; j++) {
    key = allCards[j]
    value = allData[key]
    if (usedCounters.has(key)) {
      continue
    } else {
      window.console.log(key)
      usedCounters.add(key)
      let randIndex = Math.floor(Math.random() * value.length)
      let arts = allData[key].splice(randIndex, 1)
      samples[arts[0].artImg] = [key, arts[0].normalImg]
      i++
      if (i >= k) {
        break
      }
    }
  }
  for (const key of usedCounters) {
    if (allData[key].length === 0) {
      delete allData[key]
    }
  }
  if (whichGuesser == 'artist') {
    usedCounters = new Set(cardNames)
  } else {
    let count = 0
    shuffleArray(cardNames)
    for (let j = 0; j < cardNames.length; j++) {
      key = cardNames[j]
      value = cardNames[key]
      if (usedCounters.has(key)) {
        continue
      } else {
        window.console.log(key)
        usedCounters.add(key)
        count++
        if (count >= extra) {
          break
        }
      }
    }
  }
  return [samples, usedCounters]
}

function createNewArtistMap() {
  let usedCounters = new Set()
  let samples = {}
  let i = 0
  let newTotal = 0
  let allCards = []
  for (const [key, value] of Object.entries(allData)) {
    for (let j = 0; j < value.length; j++) {
      allCards.push(key)
    }
  }
  shuffleArray(allCards)
  window.console.log(allCards)
  for (let j = 0; j < allCards.length; j++) {
    key = allCards[j]
    value = allData[key]
    if (usedCounters.has(key)) {
      continue
    } else {
      window.console.log(key)
      usedCounters.add(key)
      samples[key] = value
      newTotal += value.length
      i++
      if (i >= k + extra) {
        break
      }
    }
  }
  return [samples, newTotal]
}

function fetchToResponse(fetch) {
  return fetch
    .then((response) => response.json())
    .then((json) => putIntoMapAndFetch(json))
}

function determineIfSkip(card) {
  if (!un) {
    if (card.set_type === 'funny') {
      return true
    }
  }
  if (!online) {
    if (card.digital) {
      return true
    }
  }
  if (firstPrint) {
    if (whichGuesser == 'basic') {
      if (
        card.set_type !== 'expansion' &&
        card.set_type !== 'funny' &&
        card.set_type !== 'draft_innovation'
      ) {
        return true
      }
    } else if (whichGuesser == 'artist') {
      if (
        card.set_type === 'token' ||
        card.set_type === 'vanguard' ||
        card.set_type === 'planechase' ||
        card.set_type === 'archenemy' ||
        card.set_type === 'memorabilia'
      ) {
        return true
      }
    } else {
      if (
        card.reprint === true ||
        (card.frame_effects && card.frame_effects.includes('showcase'))
      ) {
        return true
      }
    }
  }
  // reskinned card names show in art crop
  if (card.flavor_name) {
    return true
  }

  return false
}

function putIntoMap(data) {
  for (let i = 0; i < data.length; i++) {
    let card = data[i]
    if (determineIfSkip(card)) {
      continue
    }
    let name = card.name
    // remove slashes from adventure cards
    if (card.card_faces) {
      name = card.card_faces[0].name
    }
    if (whichGuesser === 'basic') {
      name =
        '<img class="symbol" style="width: 17px; height: 17px" src="' +
        sets[name][1] +
        '" /> ' +
        sets[name][0]
    }
    let normalImg = ''
    if (card.image_uris.normal) {
      normalImg = card.image_uris.normal
    } else {
      continue
    }
    let artImg = ''
    if (card.image_uris.art_crop) {
      artImg = card.image_uris.art_crop
    } else {
      continue
    }
    total += 1
    if (!allData[name]) {
      allData[name] = [{ artImg: artImg, normalImg: normalImg }]
    } else {
      allData[name].push({ artImg: artImg, normalImg: normalImg })
    }
  }
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1))
    let temp = array[i]
    array[i] = array[j]
    array[j] = temp
  }
}

function setUpNewGame() {
  wordsLeft = k + extra
  imagesLeft = k
  let currentRound = totalSeen / k
  if (currentRound + 1 === maxRounds) {
    document.getElementById('round-number').innerText = 'Final Round'
  } else {
    document.getElementById('round-number').innerText =
      'Round ' + (1 + currentRound)
  }

  setWordsLeft()
  // select new cards
  let sampledData = getKSamples()
  artDict = sampledData[0]
  let randomImages = Object.keys(artDict)
  shuffleArray(randomImages)
  let namesList = Array.from(sampledData[1]).sort((a, b) =>
    removeSymbol(a).localeCompare(removeSymbol(b))
  )
  // fill in the new cards and names
  for (let cardIndex = 1; cardIndex <= k; cardIndex++) {
    let currCard = document.getElementById('card-' + cardIndex)
    currCard.classList.remove('incorrect')
    currCard.dataset.name = ''
    currCard.dataset.url = randomImages[cardIndex - 1]
    currCard.style.backgroundImage = "url('" + currCard.dataset.url + "')"
  }
  const nameBank = document.querySelector('.names-bank')
  for (nameIndex = 1; nameIndex <= k + extra; nameIndex++) {
    currName = document.getElementById('name-' + nameIndex)
    // window.console.log(currName)
    currName.innerHTML = namesList[nameIndex - 1]
    nameBank.appendChild(currName)
  }
}

function removeSymbol(name) {
  let arr = name.split('>')
  return arr[arr.length - 1]
}

function checkAnswers() {
  let score = k
  // show the correct full cards
  for (cardIndex = 1; cardIndex <= k; cardIndex++) {
    currCard = document.getElementById('card-' + cardIndex)
    let incorrect = true
    if (currCard.dataset.name) {
      // remove image text
      let guessWithSymbol = document.getElementById(
        currCard.dataset.name
      ).innerHTML
      let ansWithSymbol = artDict[currCard.dataset.url][0]
      let guess = removeSymbol(guessWithSymbol)
      let ans = removeSymbol(ansWithSymbol)
      incorrect = ans !== guess
      // decide if their guess was correct
      // window.console.log(ans, guess, incorrect)
      if (incorrect) {
        window.console.log(
          document.getElementById(currCard.dataset.name),
          guess,
          ans
        )
        document.getElementById(currCard.dataset.name).innerHTML =
          '<strike>' + guessWithSymbol + '</strike><br/>' + ansWithSymbol
      }
    }
    if (incorrect) {
      currCard.classList.add('incorrect')
      // tally some kind of score
      score--
      // show the correct answer
    }

    // show the correct card
    currCard.style.backgroundImage =
      "url('" + artDict[currCard.dataset.url][1] + "')"
  }
  totalSeen += k
  totalCorrect += score
  document.getElementById('score-amount').innerText = score + '/' + k
  document.getElementById('score-percent').innerText = Math.round(
    (totalCorrect * 100) / totalSeen
  )
  document.getElementById('score-amount-total').innerText =
    totalCorrect + '/' + totalSeen
}

function toggleMode() {
  event.preventDefault()
  if (mode === 'PLAY') {
    mode = 'ANSWER'
    document.querySelector('.play-page').classList.add('answer-page')
    window.console.log(totalSeen)
    if (totalSeen / k === maxRounds - 1) {
      document.getElementById('submit').style.display = 'none'
    } else {
      document.getElementById('submit').value = 'Next Round'
    }
    checkAnswers()
  } else {
    mode = 'PLAY'
    document.querySelector('.play-page').classList.remove('answer-page')
    document.getElementById('submit').value = 'Submit'
    setUpNewGame()
  }
}

function allowDrop(ev, id) {
  ev.preventDefault()
}

function drag(ev) {
  ev.dataTransfer.setData('text', ev.target.id)
  let nameEl = document.querySelector('.selected')
  if (nameEl) nameEl.classList.remove('selected')
}

function drop(ev, id) {
  ev.preventDefault()
  var data = ev.dataTransfer.getData('text')
  dropOnCard(id, data)
}

function returnDrop(ev) {
  ev.preventDefault()
  var data = ev.dataTransfer.getData('text')
  returnToNameBank(data)
}

function returnToNameBank(name) {
  document
    .querySelector('.names-bank')
    .appendChild(document.getElementById(name))
  let prevContainer = document.querySelector('[data-name=' + name + ']')
  if (prevContainer) {
    prevContainer.dataset.name = ''
    wordsLeft += 1
    imagesLeft += 1
    setWordsLeft()
  }
}

function selectName(ev) {
  if (ev.target.parentNode.classList.contains('names-bank')) {
    let nameEl = document.querySelector('.selected')
    if (nameEl) nameEl.classList.remove('selected')
    ev.target.classList.add('selected')
  } else {
    returnToNameBank(ev.target.id)
  }
}

function dropSelected(ev, id) {
  ev.preventDefault()
  let nameEl = document.querySelector('.selected')
  window.console.log('drop selected', nameEl)
  if (!nameEl) return
  nameEl.classList.remove('selected')
  dropOnCard(id, nameEl.id)
}

function dropOnCard(id, data) {
  let target = document.getElementById('card-' + id)
  target.appendChild(document.getElementById(data))
  // if this already has a name, remove that name
  if (target.dataset.name) {
    returnToNameBank(target.dataset.name)
  }
  // remove name data from a previous card if there is one
  let prevContainer = document.querySelector('[data-name=' + data + ']')
  if (prevContainer) {
    prevContainer.dataset.name = ''
  } else {
    wordsLeft -= 1
    imagesLeft -= 1
    setWordsLeft()
  }
  target.dataset.name = data
}

function setWordsLeft() {
  cardName = 'Unused Card Names: '
  if (whichGuesser === 'basic') {
    cardName = 'Unused Set Names: '
  }
  document.getElementById('words-left').innerText =
    cardName + wordsLeft + '/Images: ' + imagesLeft
}
