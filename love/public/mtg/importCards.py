import time
import requests
import json
import math

# queued categories: 'terror', 'wrath', 'zombie', 'artifact']
# add category name here
allCategories = ['counterspell', 'beast', 'burn', 'commander', 'artifact']
specialCategories = ['set', 'basic', 'watermark']
artist_denylist = '-a%3A"jason+felix"+-a%3A“Harold+McNeill”+-a%3A"Terese+Nielsen"+-a%3A“Noah+Bradley”'
artist_allowlist = {'David Martin', 'V\u00e9ronique Meignaud', 'Christopher Rush', 'Rebecca Guay', 'DiTerlizzi',
                    'Anthony Francisco', 'Wylie Beckert', 'Rovina Cai', 'Dominik Mayer', 'Omar Rayyan', 'Thomas M. Baxa'}


def generate_initial_query(category):
    string_query = 'https://api.scryfall.com/cards/search?q='
    if category == 'counterspell':
        string_query += 'otag%3Acounterspell+t%3Ainstant+not%3Aadventure+not%3Adfc'
    elif category == 'beast':
        string_query += '-t%3Alegendary+t%3Abeast+-t%3Atoken+not%3Adfc'
    # elif category == 'terror':
    #     string_query += 'otag%3Acreature-removal+o%3A%2Fdestroy+target.%2A+%28creature%7Cpermanent%29%2F+%28t' \
    #                     '%3Ainstant+or+t%3Asorcery%29+o%3Atarget+not%3Aadventure'
    # elif category == 'wrath':
    #     string_query += 'otag%3Asweeper-creature+%28t%3Ainstant+or+t%3Asorcery%29+not%3Aadventure+not%3Adfc'
    elif category == 'burn':
        string_query += '%28c>%3Dr+or+mana>%3Dr%29+%28o%3A%2Fdamage+to+them%2F+or+%28o%3Adeals+o%3Adamage+o%3A' \
                        '%2Fcontroller%28%5C.%7C+%29%2F%29+or+o%3A%2F~+deals+%28.%7C..%29+damage+to+%28any+target%7C' \
                        '.*player%28%5C.%7C+or+planeswalker%29%7C.*opponent%28%5C.%7C+or+planeswalker%29%29%2F%29' \
                        '+%28type%3Ainstant+or+type%3Asorcery%29+not%3Aadventure+not%3Adfc'
    elif category == 'commander':
        string_query += 'is%3Acommander+%28not%3Adigital+-banned%3Acommander+or+is%3Adigital+legal%3Ahistoricbrawl' \
            '+or+legal%3Acommander+or+legal%3Abrawl%29'
    # elif category == 'zombie':
    #     string_query += '-type%3Alegendary+type%3Azombie+-type%3Atoken+not%3Adfc'
    elif category == 'artifact':
        string_query += 't%3Aartifact+not%3Adatestamped+-t%3Acreature+-t%3Atoken+-art%3Acreation-date+not%3Adfc'
    # add category string query here
    string_query += '+-%28set%3Asld+%28cn>%3D231+cn<%3D233+or+cn>%3D436+cn<%3D440+or+cn>%3D321+cn<%3D324+or' \
        '+cn>%3D185+cn<%3D189+or+cn>%3D138+cn<%3D142+or+cn>%3D364+cn<%3D368+or+cn%3A669+or+cn%3A670%29%29+' \
        '-%28set%3Asta+cn>%3D64+cn<%3D126%29+-set%3Acmb2+-set%3Acmb1+not%3Asplit'
    string_query += '+-st%3Amemorabilia+-set%3Aplist+-name%3A%2F%5EA-%2F&order=released&dir=asc&unique=prints&page='
    print(string_query)
    return string_query


def generate_initial_special_query(category):
    string_query = 'https://api.scryfall.com/cards/search?q='
    if category == 'set':
        return 'https://api.scryfall.com/sets'
    elif category == 'basic':
        string_query += 't%3Abasic&order=released&dir=asc&unique=prints&page='
    elif category == 'watermark':
        string_query += 'has%3Awatermark+-t%3Atoken+-st%3Amemorabilia+-set%3Aplist+-name%3A%2F%5EA-%2F&order=released&dir=asc&unique=prints&page='
    # add category string query here
    print(string_query)
    return string_query


def generate_initial_artist_query():
    string_query = 'https://api.scryfall.com/cards/search?q=' + artist_denylist + \
        '-security_stamp%3Atriangle+-art%3Aartist-signature+artists%3D1+-st%3Afunny+not%3Aextra+not%3Adigital+-st%3Atoken+-t%3Avanguard+-st%3Amemorabilia+-t%3Ascheme+-t%3Aplane+-t%3APhenomenon&unique=art&as=grid&order=artist&page='
    print("artistList")
    print(string_query)
    return string_query


def generate_individual_artist_query(artists, artist_list):
    string_query = 'https://api.scryfall.com/cards/search?q=%28'
    for artist in artists:
        artist_split = artist_list[artist][0].split()
        string_query += 'a%3A“' + '+'.join(artist_split) + '”+or+'
    string_query = string_query[:-4]
    string_query += '%29+-set%3Aplist-art%3Aartist-signature+artists%3D1+-name%3A%2F%5EA-%2F&order=released&dir=asc&unique=prints&page='
    return string_query


def fetch_and_write_all(category, query):
    count = 1
    will_repeat = True
    all_cards = {'data': []}
    art_names = dict()
    while will_repeat:
        response = fetch(query, count)
        will_repeat = response['has_more']
        count += 1
        to_compact_write_form(all_cards, art_names, response, category)

    with open('jsons/' + category + '.json', 'w') as f:
        json.dump(all_cards, f)


def fetch_and_write_all_special(category, query):
    count = 1
    will_repeat = True
    all_cards = {'data': []}
    art_names = dict()
    while will_repeat:
        if category == 'set':
            response = fetch_special(query)
        else:
            response = fetch(query, count)
        will_repeat = response['has_more']
        count += 1
        to_compact_write_form_special(
            all_cards, art_names, response, category, {})

    with open('jsons/' + category + '.json', 'w') as f:
        json.dump(all_cards, f)


def fetch_and_write_all_artist():
    all_cards = {'data': []}
    will_repeat = True
    count = 1
    total_artists = 0
    artists = json.load(open('jsons/artistList.json'))
    artist_ids = list(artists.keys())
    print(math.ceil(len(artist_ids)/37.0))
    for i in range(math.ceil(len(artist_ids)/37.0)):
        queried_artists_pre = artist_ids[i*37:min((i+1)*37, len(artist_ids))]
        queried_artists = []
        for j in range(len(queried_artists_pre)):
            if artists[queried_artists_pre[j]][1] >= 50 or artists[queried_artists_pre[j]][0] in artist_allowlist:
                queried_artists.append(queried_artists_pre[j])
        print(queried_artists)
        print(i)
        if len(queried_artists) == 0:
            continue
        count = 1
        will_repeat = True
        art_names = dict()
        query = generate_individual_artist_query(
            queried_artists, artists)
        print(query)
        total_artists += len(queried_artists)
        print(total_artists)
        while will_repeat:
            response = fetch(query, count)
            will_repeat = response['has_more']
            count += 1
            to_compact_write_form_special(
                all_cards, art_names, response, 'artist', artists)
        print(len(art_names))

    with open('jsons/artist.json', 'w') as f:
        json.dump(all_cards, f)


def fetch_and_write_initial_artist_query():
    prev_artist = "dummy_artist"
    artists = {"dummy_artist": [1, 1]}
    all_artists_query = generate_initial_artist_query()
    will_repeat = True
    count = 1
    while will_repeat:
        print("artist fetching: "+str(count))
        response = fetch(all_artists_query, count)
        will_repeat = response['has_more']
        count += 1
        prev_artist = write_to_artist_list(response, artists, prev_artist)
    with open('jsons/artistList.json', 'w') as f:
        json.dump(artists, f)


def fetch(query, count):
    query += str(count)
    response = requests.get(f"{query}").json()
    time.sleep(0.1)
    return response


def fetch_special(query):
    response = requests.get(f"{query}").json()
    time.sleep(0.1)
    return response


def write_art(art_names, id, index, card):
    if card['digital'] or card['set_type'] == 'promo' or card['promo'] or card['lang'] != 'en':
        art_names[id] = index
    else:
        art_names[id] = -1


def to_compact_write_form(smallJson, art_names, response, category):
    fieldsInCard = ['name', 'image_uris',
                    'reprint', 'frame_effects', 'digital', 'set_type', 'security_stamp']
    data = smallJson['data']
    # write all fields needed in card
    for card in response['data']:
        digital_holder = filter_card(card, art_names, data)
        if digital_holder == False:
            continue
        write_card = dict()
        for field in fieldsInCard:
            if field == 'name' and category == 'artifact':
                write_card['name'] = card['released_at'].split('-')[0]
            elif field == 'name' and 'card_faces' in card:
                write_card['name'] = card['card_faces'][0]['name']
            elif field == 'image_uris':
                if 'card_faces' in card and 'image_uris' in card['card_faces'][0]:
                    write_card['image_uris'] = write_image_uris(
                        card['card_faces'][0]['image_uris'])
                else:
                    write_card['image_uris'] = write_image_uris(
                        card['image_uris'])
            elif category == 'commander' and field == 'set_type' and card[field] == 'funny' and (card['legalities']['commander'] == 'legal' or card['legalities']['brawl'] == 'legal'):
                continue
            elif field in card and card[field]:
                write_card[field] = card[field]
        if digital_holder != -1:
            data[digital_holder] = write_card
        else:
            data.append(write_card)


def to_compact_write_form_special(smallJson, art_names, response, category, artists):
    fieldsInBasic = ['image_uris', 'set',
                     'set_type', 'digital', 'security_stamp']
    fieldsInArtist = ['image_uris', 'digital',
                      'set_type', 'artist_ids', 'security_stamp']
    fieldsInWatermark = ['image_uris', 'watermark',
                         'set_type', 'digital', 'security_stamp', 'set']
    data = smallJson['data']
    # write all fields needed in card
    for card in response['data']:
        if category == 'basic':
            # do not repeat art
            digital_holder = filter_card(card, art_names, data)
            if digital_holder == False:
                continue
            write_card = dict()
            for field in fieldsInBasic:
                if field == 'image_uris':
                    write_card['image_uris'] = write_image_uris(
                        card['image_uris'])
                elif field == 'set':
                    write_card['name'] = card['set']
                elif field in card and card[field]:
                    write_card[field] = card[field]
            if digital_holder != -1:
                data[digital_holder] = write_card
            else:
                data.append(write_card)
        elif category == 'artist':
            # do not repeat art
            digital_holder = filter_card(card, art_names, data)
            if digital_holder == False:
                continue
            write_card = dict()
            for field in fieldsInArtist:
                if field == 'artist_ids':
                    write_card['name'] = artists[card['artist_ids'][0]][0]
                elif field == 'image_uris':
                    if 'card_faces' in card and 'image_uris' in card['card_faces'][0]:
                        write_card['image_uris'] = write_image_uris(
                            card['card_faces'][0]['image_uris'])
                    else:
                        write_card['image_uris'] = write_image_uris(
                            card['image_uris'])
                elif field in card and card[field]:
                    write_card[field] = card[field]
            if digital_holder != -1:
                data[digital_holder] = write_card
            else:
                data.append(write_card)
        elif category == 'watermark':
            # do not repeat art
            digital_holder = filter_card(card, art_names, data)
            if digital_holder == False:
                continue
            if 'card_faces' in card and 'watermark' in card['card_faces'][0] and 'watermark' in card['card_faces'][1] and card['card_faces'][1]['watermark'] != card['card_faces'][0]['watermark']:
                # print(card['name'])
                continue
            write_card = dict()
            for field in fieldsInWatermark:
                if field == 'watermark':
                    # print(card['name'])
                    if 'card_faces' in card:
                        write_card['name'] = card['card_faces'][0]['watermark'].capitalize(
                        )
                    else:
                        write_card['name'] = card['watermark'].capitalize()
                elif field == 'image_uris':
                    if 'card_faces' in card and 'image_uris' in card['card_faces'][0]:
                        write_card['image_uris'] = write_image_uris(
                            card['card_faces'][0]['image_uris'])
                    else:
                        write_card['image_uris'] = write_image_uris(
                            card['image_uris'])
                elif field in card and card[field]:
                    write_card[field] = card[field]
            if digital_holder != -1:
                data[digital_holder] = write_card
            else:
                data.append(write_card)
        else:
            # print(card['name'])
            # print(category)
            if card['set_type'] != 'token':
                smallJson[card['code']] = [card['name'], card['icon_svg_uri']]


def filter_card(card, art_names, data):
    # do not include racist cards
    if 'content_warning' in card and card['content_warning'] == True:
        return False
    # reskinned card names show in art crop
    if 'flavor_name' in card:
        return False
    # do not repeat art
    digital_holder = -1
    if 'card_faces' in card:
        card_face = card['card_faces'][0]
        if 'illustration_id' not in card_face or card_face['illustration_id'] in art_names and (art_names[card_face['illustration_id']] < 0 or card['digital']):
            return False
        else:
            ind = len(data)
            if (card_face['illustration_id'] in art_names):
                digital_holder = art_names[card['illustration_id']]
                ind = -1
            write_art(
                art_names, card_face['illustration_id'], ind, card)
    elif 'illustration_id' not in card or card['illustration_id'] in art_names and (art_names[card['illustration_id']] < 0 or card['digital']):
        return False
    else:
        ind = len(data)
        if (card['illustration_id'] in art_names):
            digital_holder = art_names[card['illustration_id']]
            ind = -1
        write_art(art_names, card['illustration_id'], ind, card)
    return digital_holder


def write_to_artist_list(response, artists, prev_artist):
    for card in response['data']:
        artist_id = card['artist_ids'][0]
        artist = card['artist']
        if artist_id not in artists:
            if artists[prev_artist][1] < 10:
                del artists[prev_artist]
            prev_artist = artist_id
            print(artist)
            artists[artist_id] = [artist, 1]
        else:
            if len(artist) < len(artists[artist_id][0]):
                artists[artist_id][0] = artist
            artists[artist_id][1] += 1
    return prev_artist


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


# def effective_hp(hp, hpp, defense, defp, spdef, spp):
#     return hp * (1+hpp*0.01) * (1200 + defense * (1+0.01*defp) + spdef * (1+0.01*spp)) / 1200.0


if __name__ == "__main__":
    # uncomment this once in a while, but it's expensive to run
    fetch_and_write_initial_artist_query()

    for category in allCategories:
        print(category)
        fetch_and_write_all(category, generate_initial_query(category))
    for category in specialCategories:
        print(category)
        fetch_and_write_all_special(
            category, generate_initial_special_query(category))
    fetch_and_write_all_artist()
