#graph data structure

def graph(graph):
    list = []
    for i  in graph:
        for nei in  graph[i]:
            list.append((i , nei))
    return list
    
g = { "A":["B","C","D"],
                  "B":["A","C","D"],
                  "C" : ["A","B","D"] ,
                  "D" : ["A","B","C"]}

print(graph(g))

