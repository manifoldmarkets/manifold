import time
import requests
import json

# add category name here
allCategories = ['counterspell', 'beast', 'terror', 'wrath', 'burn']


def generate_initial_query(category):
    string_query = 'https://api.scryfall.com/cards/search?q='
    if category == 'counterspell':
        string_query += 'otag%3Acounterspell+t%3Ainstant+not%3Aadventure'
    elif category == 'beast':
        string_query += '-type%3Alegendary+type%3Abeast+-type%3Atoken'
    elif category == 'terror':
        string_query += 'otag%3Acreature-removal+o%3A%2Fdestroy+target.%2A+%28creature%7Cpermanent%29%2F+%28t' \
                        '%3Ainstant+or+t%3Asorcery%29+o%3Atarget+not%3Aadventure'
    elif category == 'wrath':
        string_query += 'otag%3Asweeper-creature+%28t%3Ainstant+or+t%3Asorcery%29+not%3Aadventure'
    elif category == 'burn':
        string_query += '%28c>%3Dr+or+mana>%3Dr%29+%28o%3A%2Fdamage+to+them%2F+or+%28o%3Adeals+o%3Adamage+o%3A' \
                        '%2Fcontroller%28%5C.%7C+%29%2F%29+or+o%3A%2F~+deals+%28.%7C..%29+damage+to+%28any+target%7C' \
                        '.*player%28%5C.%7C+or+planeswalker%29%7C.*opponent%28%5C.%7C+or+planeswalker%29%29%2F%29' \
                        '+%28type%3Ainstant+or+type%3Asorcery%29+not%3Aadventure'
    # add category string query here
    string_query += '+-%28set%3Asld+%28%28cn>%3D231+cn<%3D233%29+or+%28cn>%3D321+cn<%3D324%29+or+%28cn>%3D185+cn' \
                    '<%3D189%29+or+%28cn>%3D138+cn<%3D142%29+or+%28cn>%3D364+cn<%3D368%29+or+cn%3A669+or+cn%3A670%29' \
                    '%29+-name%3A%2F%5EA-%2F+not%3Adfc+not%3Asplit+-set%3Acmb2+-set%3Acmb1+-set%3Aplist+-set%3Adbl' \
                    '+-frame%3Aextendedart+language%3Aenglish&unique=art&page='
    print(string_query)
    return string_query


def fetch_and_write_all(category, query):
    count = 1
    will_repeat = True
    while will_repeat:
        will_repeat = fetch_and_write(category, query, count)
        count += 1


def fetch_and_write(category, query, count):
    query += str(count)
    response = requests.get(f"{query}").json()
    time.sleep(0.1)
    with open('jsons/' + category + str(count) + '.json', 'w') as f:
        json.dump(to_compact_write_form(response), f)
    return response['has_more']


def to_compact_write_form(response):
    fieldsToUse = ['has_more']
    fieldsInCard = ['name', 'image_uris', 'content_warning', 'flavor_name', 'reprint', 'frame_effects', 'digital',
                    'set_type']
    smallJson = dict()
    data = []
    # write all fields needed in response
    for field in fieldsToUse:
        smallJson[field] = response[field]
    # write all fields needed in card
    for card in response['data']:
        write_card = dict()
        for field in fieldsInCard:
            if field == 'name' and 'card_faces' in card:
                write_card['name'] = card['card_faces'][0]['name']
            elif field == 'image_uris':
                write_card['image_uris'] = write_image_uris(card['image_uris'])
            elif field in card:
                write_card[field] = card[field]
        data.append(write_card)
    smallJson['data'] = data
    return smallJson


# only write images needed
def write_image_uris(card_image_uris):
    image_uris = dict()
    if 'normal' in card_image_uris:
        image_uris['normal'] = card_image_uris['normal']
    elif 'large' in card_image_uris:
        image_uris['normal'] = card_image_uris['large']
    elif 'small' in card_image_uris:
        image_uris['normal'] = card_image_uris['small']
    if card_image_uris:
        image_uris['art_crop'] = card_image_uris['art_crop']
    return image_uris


if __name__ == "__main__":
    for category in allCategories:
        print(category)
        fetch_and_write_all(category, generate_initial_query(category))
