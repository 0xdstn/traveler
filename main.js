var inputField = document.getElementById('input-text');
var submitBtn = document.getElementById('input-submit');
var output = document.getElementById('output');
var uploadFile = document.getElementById('upload-file');
var locDisplay = document.getElementById('loc');

const glyphs = {
    ROOM:        '~',
    NPC:         '#',
    ACTION:      '!',
    OBJECT:      '@',
    NAME:        '+',
    DESCRIPTION: '&',
    LOCK:        '%',
    TELEPORT:    '>',
    VARIABLE:    '$'
};

const lsPrefix = 'traveler-';
const lsWorld = lsPrefix + 'world';
const lsInventory = lsPrefix + 'inventory';
const lsLoc = lsPrefix + 'loc';

var hist = [];
var histIndex = 0;

var rooms = {
    '0,0': {
        name: 'Empty room',
        description: 'An empty room',
        objects: [],
        npcs: [],
        teleports: [],
        locks: []
    }
};

var objects = {};
var npcs = {};

var inventory = [];
var loc = '0,0';

const reader = new FileReader();

reader.addEventListener("load", () => {
	importWorldData(reader.result,'0,0');
}, false);


inputField.addEventListener('keyup', function(e) {
    if(e.keyCode === 13) { // Enter
        process();
    } else if(e.keyCode === 38) { // Up
        if(hist.length) {
            inputField.value = hist[histIndex];
            histIndex--;
            if(histIndex < 0) {
                histIndex = 0;
            }
        }
    } else if(e.keyCode === 40) { // Down
        if(hist.length) {
            histIndex++;
            if(histIndex > hist.length-1) {
                histIndex = hist.length-1;
            }
            inputField.value = hist[histIndex];
        }
    }
});

submitBtn.addEventListener('click', function(e) {
   process();
});

function process() {
    var cmd = inputField.value;

    inputField.value = '';

    hist.push(cmd);
    histIndex = hist.length-1;

    var c = cmd.trim().split(' ');

    updateOutput('<strong>&gt; ' + cmd.trim() + '</strong>');

    if(c[0] === 'load' && c.length > 1) {
        loadFromUrl(c[1]);
    } else if(c[0] === 'import') {
        uploadFile.click();
    } else if(c[0] === 'export' && c.length === 2) {
        exportWorld(c[1]);
    } else if(c[0] === 'debug') {
        debug();
    } else if(c[0] === 'look') {
        if(c.length > 1) {
            lookThing(c[1]);
        } else {
            lookRoom();
        }
    } else if(c[0] === 'go' && c.length > 1) {
        go(c[1]);
    } else if(c[0] === 'teleport' && c.length > 1) {
        goCoord(c[1]);
    } else if(c[0] === 'where') {
        where();
    } else if(c[0] === 'new') {
        objects = {};
        npcs = {};
        inventory = [];
        rooms = {
            '0,0': {
                name: 'Empty room',
                description: 'An empty room',
                objects: [],
                npcs: [],
                teleports: [],
                locks: []
            }
        };

        updateOutput('You reset the world.');
        goCoord('0,0');
    } else if(c[0] === 'set' && c.length > 2) {
        set(c);
    } else if(c[0] === 'rename' && c.length > 2) {
        rename(c);
    } else if(c[0] === 'describe' && c.length > 2) {
        describe(c);
    } else if(c[0] === 'move' && c.length > 1) {
        move(c[1]);
    } else if(c[0] === 'add' && c.length === 3) {
        add(c);
    } else if(c[0] === 'remove' && c.length === 3) {
        remove(c);
    } else if(c[0] === 'remove' && c.length === 2 && c[1] === 'room') {
        removeRoom();
    } else if(c[0] === 'create' && c.length === 3) {
        create(c);
    } else if(c[0] === 'grab' && c.length === 2) {
        grab(c[1]);
    } else if(c[0] === 'drop' && c.length === 2) {
        drop(c);
    } else if(c[0] === 'inventory') {
        showInventory();
    } else {
        var found = processActions(c);
        if( !found ) {
            updateOutput('Unknown command');
        }
    }
    saveState();
}

function saveState() {
    var lines = generateWorldLines();
    var text = lines.join('\n');
    localStorage.setItem(lsWorld,text);
    localStorage.setItem(lsInventory,inventory.join(','));
    localStorage.setItem(lsLoc,loc);
}

function processActions(c) {
    var found = false;

    if(c.length === 2) {
        if(rooms[loc].npcs.includes(c[1]) && npcs[c[1]].actions[c[0]] !== undefined) {
            runAction(npcs[c[1]].actions[c[0]],c[1])
            found = true;
        }
        else if(rooms[loc].objects.includes(c[1]) && objects[c[1]].actions[c[0]] !== undefined) {
            runAction(objects[c[1]].actions[c[0]],c[1])
            found = true;
        }
        else if(inventory.includes(c[1]) && objects[c[1]].actions[c[0]] !== undefined) {
            runAction(objects[c[1]].actions[c[0]],c[1])
            found = true;
        }
    }

    return found;
}

function runAction(lines,key) {
    var inIf = false;
    var inElse = false;
    var ifBool = false;
    lines.forEach(l => {
        if(inIf) {
            if(l.startsWith('ENDIF')) {
                inIf = false;
                inElse = false;
                ifBool = false;
            } else if(l.startsWith('ELSE')) {
                inElse = true;
            }
        }
        if((!inElse && ifBool) || (inElse && !ifBool) || !inIf) {
            if(l.startsWith('ECHO')) {
                updateOutput(l.substr(5));
            } else if(l.startsWith('GRAB')) {
                grab(l.substr(6),true);
            } else if(l.startsWith('SET')) {
                const sp = l.substr(7).split(' = ');
                objects[key].variables[sp[0]] = sp[1];
            } else if(l.startsWith('IF')) {
                inIf = true;
                var cond = l.substr(6);
                if(cond.startsWith('INVENTORY')) {
                    const items = cond.substr(10).split(',');
                    ifBool = true;
                    items.forEach(i => {
                        if(!inventory.includes(i)) {
                            ifBool = false;
                        }
                    });
                } else if(cond.startsWith('$') && cond.indexOf(' = ')) {
                    const sp = cond.substr(1).split(' = ');
                    if(objects[key].variables[sp[0]] !== undefined && objects[key].variables[sp[0]] === sp[1]) {
                        ifBool = true;
                    }
                }
            }
        }
    });
}

function create(cmd) {
    if(cmd[1] === 'room') {
        rooms[cmd[2]] = {
            name: 'Empty room',
            description: 'An empty room',
            objects: [],
            npcs: [],
            teleports: [],
            locks:[]
        }
        goCoord(cmd[2])
    } else if(cmd[1] === 'object') {
        objects[cmd[2]] = {
            name: 'Something',
            description: 'A formless thing',
            actions: {},
            variables: {}
        }
        rooms[loc].objects.push(cmd[2]);
        updateOutput('You added a new object to the room');
    } else if(cmd[1] === 'npc') {
        npcs[cmd[2]] = {
            name: 'Someone',
            description: 'Very ordinary',
            actions: {}
        }
        rooms[loc].npcs.push(cmd[2]);
        updateOutput('You added a new npc to the room');
    }
}

function generateWorldLines() {
    var lines = [];

    Object.keys(rooms).forEach(i => {
        lines.push(glyphs.ROOM + ' ' + i);
        lines.push(glyphs.NAME + ' ' + rooms[i].name);
        lines.push(glyphs.DESCRIPTION + ' ' + rooms[i].description);
        rooms[i].objects.forEach(o => {
            lines.push(glyphs.OBJECT + ' ' + o);
        });
        rooms[i].npcs.forEach(n => {
            lines.push(glyphs.NPC + ' ' + n);
        });
        rooms[i].teleports.forEach(t => {
            lines.push(glyphs.TELEPORT + ' ' + t);
        });
        rooms[i].locks.forEach(l => {
            lines.push(glyphs.LOCK + ' ' + l);
        });
        lines.push('');
    });

    Object.keys(objects).forEach(i => {
        lines.push(glyphs.OBJECT + ' ' + i);
        lines.push(glyphs.NAME + ' ' + objects[i].name);
        lines.push(glyphs.DESCRIPTION + ' ' + objects[i].description);
        Object.keys(objects[i].actions).forEach(a => {
            lines.push(glyphs.ACTION + ' ' + a);
            objects[i].actions[a].forEach(al => {
                lines.push('  ' + al);
            });
        });
        Object.keys(objects[i].variables).forEach(v => {
            lines.push(glyphs.VARIABLE + ' ' + v + ' = ' + objects[i].variables[v]);
        });
        lines.push('');
    });

    Object.keys(npcs).forEach(i => {
        lines.push(glyphs.NPC + ' ' + i);
        lines.push(glyphs.NAME + ' ' + npcs[i].name);
        lines.push(glyphs.DESCRIPTION + ' ' + npcs[i].description);
        Object.keys(npcs[i].actions).forEach(a => {
            lines.push(glyphs.ACTION + ' ' + a);
            npcs[i].actions[a].forEach(al => {
                lines.push('  ' + al);
            });
        });
        lines.push('');
    });

    return lines;
}

function exportWorld(filename) {
    var lines = generateWorldLines();
    var text = lines.join('\n');

    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}

function rename(cmd) {
    var val = cmd.splice(2,cmd.length-1).join(' ');

    if(objects[cmd[1]] !== undefined) {
        objects[cmd[1]].name = val;
        updateOutput('You updated the name of ' + cmd[1] + '.');
    }

    if(npcs[cmd[1]] !== undefined) {
        npcs[cmd[1]].name = val;
        updateOutput('You updated the name of ' + cmd[1] + '.');
    }
}

function describe(cmd) {
    var val = cmd.splice(2,cmd.length-1).join(' ');

    if(objects[cmd[1]] !== undefined) {
        objects[cmd[1]].description = val;
        updateOutput('You updated the description of ' + cmd[1] + '.');
    }

    if(npcs[cmd[1]] !== undefined) {
        npcs[cmd[1]].description = val;
        updateOutput('You updated the description of ' + cmd[1] + '.');
    }
}

function set(cmd) {
    var val = cmd.splice(2,cmd.length-1).join(' ');

    if(cmd[1] === 'name') {
        rooms[loc].name = val;
        updateOutput('You updated the name of the room.');
    } else if(cmd[1] === 'description') {
        rooms[loc].description = val;
        updateOutput('You updated the description of the room.');
    }
}

function add(cmd) {
    var val = cmd.splice(2,cmd.length-1).join(' ');

    if(cmd[1] === 'object') {
        if(objects[val] !== undefined) {
            rooms[loc].objects.push(val);
            updateOutput('You added ' + objects[val].name + ' to the room.');
        }
    } else if(cmd[1] === 'npc') {
        if(npcs[val] !== undefined) {
            rooms[loc].npcs.push(val);
            updateOutput('You added ' + npcs[val].name + ' to the room.');
        }
    }
}

function remove(cmd) {
    var val = cmd.splice(2,cmd.length-1).join(' ');

    if(cmd[1] === 'object') {
        if(objects[val] !== undefined) {
            rooms[loc].objects = rooms[loc].objects.filter(x => {
                return x !== val;
            });
            updateOutput('You removed any ' + objects[val].name + ' from the room.');
        }
    } else if(cmd[1] === 'npc') {
        if(npcs[val] !== undefined) {
            rooms[loc].npcs = rooms[loc].npcs.filter(x => {
                return x !== val;
            });
            updateOutput('You removed any ' + npcs[val].name + ' from the room.');
        }
    }
}

function removeRoom() {
    delete rooms[loc];
    const keys = Object.keys(rooms);
    if(keys.length) {
        goCoord(keys[0]);
    } else {
        rooms['0,0'] = {
            name: 'Empty room',
            description: 'An empty room',
            objects: [],
            npcs: [],
            teleports: [],
            locks: []
        };
        goCoord('0,0');
    }
}

function move(coord) {
    rooms[coord] = rooms[loc];
    delete rooms[loc];
    goCoord(coord);
}

function go(dir) {
    var coords = loc.split(',');
    var x = parseInt(coords[0]);
    var y = parseInt(coords[1]);

    var n = '';
    var e = '';
    var s = '';
    var w = '';

    var lockN = '';
    var lockE = '';
    var lockS = '';
    var lockW = '';
    
    rooms[loc].teleports.forEach(t => {
        if( t[0] === 'n' ) {
            n = t.substr(2);
        } else if( t[0] === 'e' ) {
            e = t.substr(2);
        } else if( t[0] === 's' ) {
            s = t.substr(2);
        } else if( t[0] === 'w' ) {
            w = t.substr(2);
        }
    });
    
    rooms[loc].locks.forEach(l => {
        if( l[0] === 'n' ) {
            lockN = l.substr(2);
        } else if( l[0] === 'e' ) {
            lockE = l.substr(2);
        } else if( l[0] === 's' ) {
            lockS = l.substr(2);
        } else if( l[0] === 'w' ) {
            lockW = l.substr(2);
        }
    });

    var locked = false;

    if( dir === 'left' || dir === 'west' || dir === 'l' || dir === 'w') {
        if( lockW.length && !inventory.includes(lockW) ) {
            locked = true;
        }
        x--;
        if( w.length ) {
            const sp = w.split(',');
            x = sp[0];
            y = sp[1];
        }
    }
    else if( dir === 'right' || dir === 'east' || dir === 'r' || dir === 'e') {
        if( lockE.length && !inventory.includes(lockE) ) {
            locked = true;
        }
        x++;
        if( e.length ) {
            const sp = e.split(',');
            x = sp[0];
            y = sp[1];
        }
    }
    else if( dir === 'up' || dir === 'north' || dir === 'u' || dir === 'n') {
        if( lockN.length && !inventory.includes(lockN) ) {
            locked = true;
        }
        y--;
        if( n.length ) {
            const sp = n.split(',');
            x = sp[0];
            y = sp[1];
        }
    }
    else if( dir === 'down' || dir === 'south' || dir === 'd' || dir === 's') {
        if( lockS.length && !inventory.includes(lockS) ) {
            locked = true;
        }
        y++;
        if( s.length ) {
            const sp = s.split(',');
            x = sp[0];
            y = sp[1];
        }
    }

    if(locked) {
        updateOutput('That direction is locked.');
    } else {
        goCoord(x.toString() + ',' + y.toString());
    }
}

function goCoord(coord) {
    if(rooms[coord] !== undefined) {
        loc = coord;
        locDisplay.innerHTML = loc;
        where();
    } else {
        updateOutput('There is no exit in that direction.');
    }
}

function where() {
    updateOutput('You are in ' + rooms[loc].name + ' (' + loc + ')');
}

function lookRoom() {
    var desc = rooms[loc].description.replaceAll('/','<br>');
    var out = '';

    if(rooms[loc].objects.length || rooms[loc].npcs.length) {
        out = 'You see:';
    }

    rooms[loc].objects.forEach(o => {
        out += '<br>- ' + objects[o].name + ' (' + o + ')';
        desc = desc.replaceAll(glyphs.OBJECT + o, '<strong>'+objects[o].name+'</strong>');
    });

    rooms[loc].npcs.forEach(n => {
        out += '<br>- ' + npcs[n].name + ' (' + n + ')';
        desc = desc.replaceAll(glyphs.NPC + n, '<strong>'+npcs[n].name+'</strong>');
    });

    var exits = [];
    const coords = loc.split(',');
    const x = parseInt(coords[0]);
    const y = parseInt(coords[1]);

    if(rooms[x.toString()+','+(y-1).toString()] !== undefined) {
        exits.push('north');
    }
    if(rooms[(x+1).toString()+','+y.toString()] !== undefined) {
        exits.push('east');
    }
    if(rooms[x.toString()+','+(y+1).toString()] !== undefined) {
        exits.push('south');
    }
    if(rooms[(x-1).toString()+','+y.toString()] !== undefined) {
        exits.push('west');
    }

    rooms[loc].teleports.forEach(t => {
        if( t[0] === 'n' ) {
            exits.push('north');
        } else if( t[0] === 'e' ) {
            exits.push('east');
        } else if( t[0] === 's' ) {
            exits.push('south');
        } else if( t[0] === 'w' ) {
            exits.push('west');
        }
    });

    if(exits.length) {
        out += '<br><br>Exits:';
        exits.forEach(e => {
            out += '<br>- ' + e;
        });
    }

    updateOutput(desc);

    if(out.length) {
        updateOutput(out);
    }
}

function lookThing(key) {
    if(objects[key] !== undefined && (rooms[loc].objects.includes(key) || inventory.includes(key))) {
        var out = objects[key].description;
            out = out.replaceAll('/','<br>');
            Object.keys(objects[key].variables).forEach(v => {
                out = out.replaceAll('$'+v,objects[key].variables[v]);
            });
        updateOutput(out);
        if(Object.keys(objects[key].actions).length) {
            updateOutput('<em>Available actions: ' + Object.keys(objects[key].actions).join(', ')+'</em>');
        }
    } else if(npcs[key] !== undefined && rooms[loc].npcs.includes(key)) {
        updateOutput(npcs[key].description.replaceAll('/','<br>'));
        if(Object.keys(npcs[key].actions).length) {
            updateOutput('<em>Available actions: ' + Object.keys(npcs[key].actions).join(', ')+'</em>');
        }
    } else {
        updateOutput('That does not appear to be here');
    }
}

function updateOutput(text) {
    output.innerHTML = output.innerHTML + '<br><br>' + text;
    output.scrollTop = output.scrollHeight;
}

function importFile(e) {
    const [file] = uploadFile.files;

    if (file) {
        updateOutput('Loading world file: ' + file.name);
        reader.readAsText(file);
    }
}

function loadFromUrl(url) {
    var client = new XMLHttpRequest();
    client.open('GET', url);
    client.onreadystatechange = function() {
        if(client.readyState === XMLHttpRequest.DONE) {
            if(client.readyState === XMLHttpRequest.DONE && client.status === 200) {
                updateOutput('Loading world file: ' + url);
                importWorldData(client.responseText, '0,0');
                inventory = [];
                saveState();
            } else {
                updateOutput('Failed to load world file: ' + url);
            }
        }
    }
    client.send();
}

function importWorldData(data, startLoc) {
    const lines = data.split('\n');
    var inRoom = false;
    var inObject = false;
    var inNpc = false;
    var inAction = false;
    var curKey = '';
    var curAction = '';

    lines.forEach(l => {
        var glyph = '';
        var info = '';

        if(l !== '') {
            const sp = l.split(' ');
            glyph = l[0];
            info = l.substr(2,l.length-1).trim();
        }

        if(l === '') {
            inRoom = false;
            inObject = false;
            inNpc = false;
            inAction = false;
            curKey = '';
            curAction = '';
        } else if(inRoom) {
            if(glyph === glyphs.NAME ) {
                rooms[curKey].name = info;
            } else if(glyph === glyphs.DESCRIPTION ) {
                rooms[curKey].description = info;
            } else if(glyph === glyphs.OBJECT) {
                rooms[curKey].objects.push(info);
            } else if(glyph === glyphs.NPC) {
                rooms[curKey].npcs.push(info);
            } else if(glyph === glyphs.TELEPORT) {
                rooms[curKey].teleports.push(info);            
            } else if(glyph === glyphs.LOCK) {
                rooms[curKey].locks.push(info);            
            }
        } else if(glyph === glyphs.ACTION) {
            inAction = true;
            curAction = info;
            if( inObject ) {
                objects[curKey].actions[curAction] = [];
            } else if( inNpc ) {
                npcs[curKey].actions[curAction] = [];
            }
        } else if(inObject) {
            if(glyph === glyphs.NAME ) {
                objects[curKey].name = info;
            } else if(glyph === glyphs.DESCRIPTION ) {
                objects[curKey].description = info;
            } else if(glyph === glyphs.VARIABLE ) {
                const v = info.split(' = ')
                objects[curKey].variables[v[0]] = v[1];
            } else if(inAction) {
                objects[curKey].actions[curAction].push(info);
            }
        } else if(inNpc) {
            if(glyph === glyphs.NAME ) {
                npcs[curKey].name = info;
            } else if(glyph === glyphs.DESCRIPTION ) {
                npcs[curKey].description = info;
            } else if(inAction) {
                npcs[curKey].actions[curAction].push(info);
            }
        } else if(glyph === glyphs.OBJECT) {
            inObject = true;
            curKey = info;
            objects[curKey] = {
                actions: {},
                variables: {}
            };
        } else if(glyph === glyphs.ROOM) {
            inRoom = true;
            curKey = info;
            rooms[curKey] = {
                name: '',
                description: [],
                objects: [],
                npcs: [],
                teleports: [],
                locks: []
            };
        } else if(glyph === glyphs.NPC) {
            inNpc = true;
            curKey = info;
            npcs[curKey] = {
                actions: {}
            };
        }
    });

    goCoord(startLoc);
}

function grab(key,override) {
    if(objects[key] !== undefined) {
        if(!override) {
            rooms[loc].objects.splice(rooms[loc].objects.indexOf(key),1);
        }
        inventory.push(key);
        updateOutput(objects[key].name + ' added to inventory.');
    }
}

function drop(cmd) {
    const key = cmd[1];
    if(objects[key] !== undefined && inventory.includes(key)) {
        rooms[loc].objects.push(key);
        inventory.splice(inventory.indexOf(key),1);
        updateOutput(objects[key].name + ' dropped.');
    }
}

function showInventory() {
    var out = '';
    inventory.forEach(o => {
        out += '- ' + objects[o].name + ' (' + o + ')<br>';
    });
    if(out.length) {
        out = out.substr(0,out.length-4);
        updateOutput(out);
    } else {
        updateOutput('Your inventory is empty.');
    }
}

function debug() {
    console.log('OBJECTS');
    console.log(objects);
    console.log('NPCS');
    console.log(npcs);
    console.log('ROOMS');
    console.log(rooms);
    console.log('INVENTORY');
    console.log(inventory);
}

if(window.location.search.startsWith('?load=')) {
    loadFromUrl(window.location.search.substr(6));
} else if(localStorage.getItem(lsWorld)) {
    updateOutput('Loading world from storage');
    importWorldData(localStorage.getItem(lsWorld),localStorage.getItem(lsLoc));
    var lsInv = localStorage.getItem(lsInventory);
    if(lsInv.length) {
        inventory = lsInv.split(',');
    }
} else {
    loadFromUrl('demo.txt');
}
