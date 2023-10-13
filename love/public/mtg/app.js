mode = 'PLAY'
allData = {}
total = 0
cardNames = []
k = 12
extra = 3
num_artists = k + extra * 2
artDict = {}
totalCorrect = 0
totalSeen = 0
wordsLeft = k + extra
imagesLeft = k
maxRounds = 20
whichGuesser = 'counterspell'
wordCategory = 'Unused Card Names: '
un = false
ub = false
online = false
firstPrint = false
flag = true
page = 1
sets = {}

window.console.log(sets)
document.location.search.split('&').forEach((pair) => {
  const setting = pair.split('=')
  if (setting[0] === '?whichguesser') {
    whichGuesser = setting[1]
  } else if (setting[0] === 'un') {
    un = setting[1]
  } else if (setting[0] === 'digital') {
    online = setting[1]
  } else if (setting[0] === 'original') {
    firstPrint = setting[1]
  } else if (setting[0] === 'ub') {
    ub = setting[1]
  }
})

if (whichGuesser === 'basic') {
  fetch('jsons/set.json')
    .then((response) => response.json())
    .then((data) => (sets = data))
}

if (whichGuesser === 'watermark') {
  fetch('jsons/wm.json')
    .then((response) => response.json())
    .then((data) => (sets = data))
}

const firstFetch = fetch('jsons/' + whichGuesser + '.json')
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
  window.console.log(cardNames)
  window.console.log(total)
  if (whichGuesser === 'counterspell') {
    document.getElementById('guess-type').innerText = 'Counterspell Guesser'
  } else if (whichGuesser === 'burn') {
    document.getElementById('guess-type').innerText = 'Match With Hot Singles'
  } else if (whichGuesser === 'beast') {
    document.getElementById('guess-type').innerText = 'Finding Fantastic Beasts'
  } else if (whichGuesser === 'basic') {
    document.getElementById('guess-type').innerText = 'How Basic'
    wordCategory = 'Unused Set Names: '
  } else if (whichGuesser === 'commander') {
    document.getElementById('guess-type').innerText = 'General Knowledge'
  } else if (whichGuesser === 'watermark') {
    document.getElementById('guess-type').innerText = 'Watermark It'
    wordCategory = 'Unused Watermarks: '
  } else if (whichGuesser === 'artist') {
    document.getElementById('guess-type').innerText = 'Aesthetic Consultation'
    wordCategory = 'Unused Artist Names: '
  } else if (whichGuesser === 'artifact') {
    document.getElementById('guess-type').innerText = 'Archaeological Dating'
    wordCategory = 'Unused Dates: '
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
      const randIndex = Math.floor(Math.random() * value.length)
      const arts = allData[key].splice(randIndex, 1)
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
      if (i >= num_artists) {
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
  if (!ub) {
    if (card.security_stamp === 'triangle') {
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
      if (card.set_type !== 'expansion' && card.set_type !== 'funny') {
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
    } else if (whichGuesser == 'watermark') {
      if (
        !(
          card.name === 'Prismari' ||
          card.name === 'Atarka' ||
          card.name === 'Obscura' ||
          card.name === 'Dimir' ||
          card.name === 'Lorehold' ||
          card.name === 'Orzhov' ||
          card.name === 'Cabaretti' ||
          card.name === 'Orderofthewidget' ||
          card.name === 'Kolaghan' ||
          card.name === 'Temur' ||
          card.name === 'Golgari' ||
          card.name === 'Dromoka' ||
          card.name === 'Azorius' ||
          card.name === 'Phyrexian' ||
          card.name === 'Mirran' ||
          card.name === 'Crossbreedlabs' ||
          card.name === 'Agentsofsneak' ||
          card.name === 'Boros' ||
          card.name === 'Goblinexplosioneers' ||
          card.name === 'Witherbloom' ||
          card.name === 'Ojutai' ||
          card.name === 'Izzet' ||
          card.name === 'Selesnya' ||
          card.name === 'Simic' ||
          card.name === 'Mardu' ||
          card.name === 'Rakdos' ||
          card.name === 'Quandrix' ||
          card.name === 'Leagueofdastardlydoom' ||
          card.name === 'Silverquill' ||
          card.name === 'Maestros' ||
          card.name === 'Sultai' ||
          card.name === 'Riveteers' ||
          card.name === 'Abzan' ||
          card.name === 'Jeskai' ||
          card.name === 'Brokers' ||
          card.name === 'Gruul' ||
          card.name === 'Silumgar'
        )
      ) {
        return true
      }
    } else {
      if (
        card.reprint ||
        (card.frame_effects && card.frame_effects.includes('showcase'))
      ) {
        return true
      }
    }
  }

  return false
}

function putIntoMap(data) {
  for (let i = 0; i < data.length; i++) {
    const card = data[i]
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
    if (whichGuesser === 'watermark' && sets.hasOwnProperty(name)) {
      name = sets[name]
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
    const j = Math.floor(Math.random() * (i + 1))
    const temp = array[i]
    array[i] = array[j]
    array[j] = temp
  }
}

function setUpNewGame() {
  wordsLeft = k + extra
  imagesLeft = k
  const currentRound = totalSeen / k
  if (currentRound + 1 === maxRounds) {
    document.getElementById('round-number').innerText = 'Final Round'
  } else {
    document.getElementById('round-number').innerText =
      'Round ' + (1 + currentRound)
  }

  setWordsLeft()
  // select new cards
  const sampledData = getKSamples()
  artDict = sampledData[0]
  const randomImages = Object.keys(artDict)
  shuffleArray(randomImages)
  const namesList = Array.from(sampledData[1]).sort((a, b) =>
    removeSpecialCharacters(a).localeCompare(removeSpecialCharacters(b))
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
  document.querySelectorAll('.temporary-name-holder').forEach((x) => x.remove())
}

function removeSpecialCharacters(name) {
  if (whichGuesser === 'basic') {
    const arr = name.split('>')
    arr.shift()
    name = arr.join('>')
  }
  const arr = name.split('amp;')
  return arr.join('')
}

function checkAnswers() {
  let score = k
  // show the correct full cards
  for (cardIndex = 1; cardIndex <= k; cardIndex++) {
    currCard = document.getElementById('card-' + cardIndex)
    let incorrect = true
    if (currCard.dataset.name) {
      // remove image text
      const guessWithSymbol = document.getElementById(
        currCard.dataset.name
      ).innerHTML
      const ansWithSymbol = artDict[currCard.dataset.url][0]
      const guess = removeSpecialCharacters(guessWithSymbol)
      const ans = removeSpecialCharacters(ansWithSymbol)
      incorrect = ans !== guess
      // decide if their guess was correct
      // window.console.log(ans, guess, incorrect)
      correctAns = String.fromCodePoint(0x2705) + ' ' + ansWithSymbol
      if (incorrect) {
        window.console.log(
          document.getElementById(currCard.dataset.name),
          guess,
          ans
        )
        document.getElementById(currCard.dataset.name).innerHTML =
          String.fromCodePoint(0x274c) +
          '&nbsp;<i style="opacity:.6"><strike>' +
          guessWithSymbol +
          '</strike></i><br/><span style="opacity:0;">' +
          String.fromCodePoint(0x274c) +
          '</span>&nbsp;' +
          ansWithSymbol
      } else {
        document.getElementById(currCard.dataset.name).innerHTML = correctAns
      }
    } else {
      let answerCorrectionHolder = document.createElement('div')
      answerCorrectionHolder.classList.add('name')
      answerCorrectionHolder.classList.add('temporary-name-holder')

      answerCorrectionHolder.innerHTML =
        String.fromCodePoint(0x274c) +
        '&nbsp;<i style="opacity:.6">&lt;No Answer&gt;&nbsp;</i><br/><span style="opacity:0;">' +
        String.fromCodePoint(0x274c) +
        '</span>&nbsp;' +
        artDict[currCard.dataset.url][0]
      currCard.appendChild(answerCorrectionHolder)
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
  const prevContainer = document.querySelector('[data-name=' + data + ']')
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
  document.getElementById('words-left').innerText =
    wordCategory + wordsLeft + '/Images: ' + imagesLeft
}
