import csv

with open('data/actual_weather_data2.csv', newline='') as csvfile:
    reader = csv.DictReader(csvfile)
    states = set()
    for row in reader:
        states.add(row['state'])
    print(states)