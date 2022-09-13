import time
import requests
import json

# add category name here
allCategories = ['counterspell', 'beast', 'burn', 'commander', 'artist'] #, 'terror', 'wrath', 'zombie', 'artifact']
specialCategories = ['set', 'basic']


def generate_initial_query(category):
    string_query = 'https://api.scryfall.com/cards/search?q='
    if category == 'counterspell':
        string_query += 'otag%3Acounterspell+t%3Ainstant+not%3Aadventure+not%3Adfc'
    elif category == 'beast':
        string_query += '-type%3Alegendary+type%3Abeast+-type%3Atoken+not%3Adfc'
    # elif category == 'terror':
    #     string_query += 'otag%3Acreature-removal+o%3A%2Fdestroy+target.%2A+%28creature%7Cpermanent%29%2F+%28t' \
    #                     '%3Ainstant+or+t%3Asorcery%29+o%3Atarget+not%3Aadventure'
    # elif category == 'wrath':
    #     string_query += 'otag%3Asweeper-creature+%28t%3Ainstant+or+t%3Asorcery%29+not%3Aadventure'
    elif category == 'burn':
        string_query += '%28c>%3Dr+or+mana>%3Dr%29+%28o%3A%2Fdamage+to+them%2F+or+%28o%3Adeals+o%3Adamage+o%3A' \
                        '%2Fcontroller%28%5C.%7C+%29%2F%29+or+o%3A%2F~+deals+%28.%7C..%29+damage+to+%28any+target%7C' \
                        '.*player%28%5C.%7C+or+planeswalker%29%7C.*opponent%28%5C.%7C+or+planeswalker%29%29%2F%29' \
                        '+%28type%3Ainstant+or+type%3Asorcery%29+not%3Aadventure+not%3Adfc'
    elif category == 'commander':
        string_query += 'is%3Acommander+%28not%3Adigital+-banned%3Acommander+or+is%3Adigital+legal%3Ahistoricbrawl+or+legal%3Acommander+or+legal%3Abrawl%29'
    # elif category == 'zombie':
    #     string_query += '-type%3Alegendary+type%3Azombie+-type%3Atoken'
    # elif category == 'artifact':
        # string_query += 't%3Aartifact&order=released&dir=asc&unique=prints&page='
    # elif category == 'artist':
    #     string_query+= 'a%3A"Wylie+Beckert"+or+a%3A“Ernanda+Souza”+or+a%3A"randy+gallegos"+or+a%3A“Amy+Weber”+or+a%3A“Dan+Frazier”+or+a%3A“Thomas+M.+Baxa”+or+a%3A“Phil+Foglio”+or+a%3A“DiTerlizzi”+or+a%3A"steve+argyle"+or+a%3A"Veronique+Meignaud"+or+a%3A"Magali+Villeneuve"+or+a%3A"Michael+Sutfin"+or+a%3A“Volkan+Baǵa”+or+a%3A“Franz+Vohwinkel”+or+a%3A"Nils+Hamm"+or+a%3A"Mark+Poole"+or+a%3A"Carl+Critchlow"+or+a%3A"rob+alexander"+or+a%3A"igor+kieryluk"+or+a%3A“Victor+Adame+Minguez”+or+a%3A"johannes+voss"+or+a%3A"Svetlin+Velinov"+or+a%3A"ron+spencer"+or+a%3A"rk+post"+or+a%3A"kev+walker"+or+a%3A"rebecca+guay"+or+a%3A"seb+mckinnon"+or+a%3A"pete+venters"+or+a%3A"greg+staples"+or+a%3A"Christopher+Moeller"+or+a%3A"christopher+rush"+or+a%3A"Mark+Tedin"'
    # add category string query here
    string_query += '+-%28set%3Asld+%28%28cn>%3D231+cn<%3D233%29+or+%28cn>%3D321+cn<%3D324%29+or+%28cn>%3D185+cn' \
                '<%3D189%29+or+%28cn>%3D138+cn<%3D142%29+or+%28cn>%3D364+cn<%3D368%29+or+cn%3A669+or+cn%3A670%29' \
                '%29+-name%3A%2F%5EA-%2F+not%3Asplit+-set%3Acmb2+-set%3Acmb1+-set%3Aplist+-st%3Amemorabilia' \
                '+language%3Aenglish&order=released&dir=asc&unique=prints&page='
    print(string_query)
    return string_query

def generate_initial_special_query(category):
    string_query = 'https://api.scryfall.com/cards/search?q='
    if category == 'set':
        return 'https://api.scryfall.com/sets'
    elif category == 'basic':
        string_query += 't%3Abasic&order=released&dir=asc&unique=prints&page='
    # add category string query here
    print(string_query)
    return string_query


def fetch_and_write_all(category, query):
    count = 1
    will_repeat = True
    all_cards = {'data' : []}
    art_names = set()
    while will_repeat:
        response = fetch(query, count)
        will_repeat = response['has_more']
        count+=1
        to_compact_write_form(all_cards, art_names, response, category)
    
    with open('jsons/' + category + '.json', 'w') as f:
        json.dump(all_cards, f)


def fetch_and_write_all_special(category, query):
    count = 1
    will_repeat = True
    all_cards = {'data' : []}
    art_names = set()
    while will_repeat:
        if category == 'set':
            response = fetch_special(query)
        else:
            response = fetch(query, count)
        will_repeat = response['has_more']
        count+=1
        to_compact_write_form_special(all_cards, art_names, response, category)
    
    with open('jsons/' + category + '.json', 'w') as f:
        json.dump(all_cards, f)
        


def fetch(query, count):
    query += str(count)
    response = requests.get(f"{query}").json()
    time.sleep(0.1)
    return response

def fetch_special(query):
    response = requests.get(f"{query}").json()
    time.sleep(0.1)
    return response


def to_compact_write_form(smallJson, art_names, response, category):
    fieldsInCard = ['name', 'image_uris', 'flavor_name', 'reprint', 'frame_effects', 'digital', 'set_type']
    data = []
    # write all fields needed in card
    for card in response['data']:
        # do not include racist cards
        if 'content_warning' in card and card['content_warning'] == True:
            continue
        # do not repeat art
        if 'card_faces' in card:
            card_face = card['card_faces'][0]
            if 'illustration_id' not in card_face or card_face['illustration_id'] in art_names:
                continue
            else:
                art_names.add(card_face['illustration_id'])
        elif 'illustration_id' not in card or card['illustration_id'] in art_names:
            continue
        else:
            art_names.add(card['illustration_id'])
        write_card = dict()
        for field in fieldsInCard:
            # if field == 'name' and category == 'artifact':
            #     write_card['name'] = card['released_at'].split('-')[0]
            if field == 'name' and 'card_faces' in card:
                write_card['name'] = card['card_faces'][0]['name']
            elif field == 'image_uris':
                if 'card_faces' in card and 'image_uris' in card['card_faces'][0]:
                     write_card['image_uris'] = write_image_uris(card['card_faces'][0]['image_uris'])
                else:
                    write_card['image_uris'] = write_image_uris(card['image_uris'])
            elif field in card:
                write_card[field] = card[field]
        data.append(write_card)
    smallJson['data'] += data

def to_compact_write_form_special(smallJson, art_names, response, category):
    fieldsInBasic = ['image_uris', 'set', 'set_type', 'digital']
    data = []
    # write all fields needed in card
    for card in response['data']:
        # do not include racist cards
        if 'content_warning' in card and card['content_warning'] == True:
            continue
        if category == 'basic':
            write_card = dict()
            # do not repeat art
            if 'illustration_id' not in card or card['illustration_id'] in art_names:
                continue
            else:
                art_names.add(card['illustration_id'])
            for field in fieldsInBasic:
                if field == 'image_uris':
                    write_card['image_uris'] = write_image_uris(card['image_uris'])
                elif field == 'set':
                    write_card['name'] = card['set']
                elif field in card:
                    write_card[field] = card[field]
            data.append(write_card)
        else:
            if card['set_type'] != 'token':
                smallJson[card['code']] = [card['name'],card['icon_svg_uri']]
        
    smallJson['data'] += data


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
    for category in specialCategories:
        print(category)
        fetch_and_write_all_special(category, generate_initial_special_query(category))
