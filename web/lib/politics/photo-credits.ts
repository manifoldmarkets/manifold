// Credits the candidate photos owe under their licences: the Creative Commons
// ones (public-domain federal portraits need none). All were cropped and
// resized, which CC asks us to say. Generated from
// web/public/political-candidates/credits.json (the full record, incl. the
// public-domain sources); regenerate if a photo changes.

export type PhotoCredit = {
  author: string
  license: string
  licenseUrl: string
  source: string
}

export const PHOTO_CREDITS: Record<string, PhotoCredit> = {
  '/political-candidates/moore.png': {
    author: 'Maryland State Government (Office of Governor Wes Moore)',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Wes_Moore_Official_Governor_Portrait.jpg',
  },
  '/political-candidates/hbiden.png': {
    author: 'Center for Strategic & International Studies (CSIS)',
    license: 'CC BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:R._Hunter_Biden_at_Center_for_Strategic_%26_International_Studies.jpg',
  },
  '/political-candidates/trumpjr.png': {
    author: 'Gage Skidmore',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Donald_Trump,_Jr._(55021618832)_(cropped_2).jpg',
  },
  '/political-candidates/kemp.png': {
    author: 'Governo do Estado de São Paulo',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0',
    source:
      'https://commons.wikimedia.org/wiki/File:Brian_Kemp_2025_(cropped).jpg',
  },
  '/political-candidates/talarico.png': {
    author: 'Larry D. Moore',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0',
    source:
      'https://commons.wikimedia.org/wiki/File:James_Talarico_Open_Congress_Austin_2023.jpg',
  },
  '/political-candidates/etrump.png': {
    author: 'Gage Skidmore',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
    source:
      'https://commons.wikimedia.org/wiki/File:Eric_Trump_by_Gage_Skidmore.jpg',
  },
  '/political-candidates/yang.png': {
    author: 'Gage Skidmore',
    license: 'CC BY-SA 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Andrew_Yang_(53318650512).jpg',
  },
  '/political-candidates/pmurphy.png': {
    author: 'Phil Murphy for Governor campaign (Flickr: PhilMurphyNJ)',
    license: 'CC BY 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Phil_Murphy_for_Governor_(cropped_2).jpg',
  },
}

export const photoCreditText = (credit: PhotoCredit) =>
  `Photo: ${credit.author}, ${credit.license} (cropped)`
