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
        string_query += '%28o%3A%2Fdamage+to+them%2F+or+%28o%3Adeals+o%3Adamage+o%3A%2Fcontroller%28%5C.%7C+%29%2F%29' \
                        '+or+o%3A%2F~+deals+%28.%7C..%29+damage+to+%28any+target%7C.%2Aplayer%28%5C.%7C+or' \
                        '+planeswalker%29%7C.%2Aopponent%28%5C.%7C+or+planeswalker%29%29%2F%29+%28type%3Ainstant+or' \
                        '+type%3Asorcery%29+not%3Aadventure'
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
        json.dump(response, f)
    return response['has_more']


if __name__ == "__main__":
    for category in allCategories:
        print(category)
        fetch_and_write_all(category, generate_initial_query(category))
