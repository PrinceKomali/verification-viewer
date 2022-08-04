let log = s => document.querySelector(".log").innerHTML = s;
let loading = `<span class='loading'></span>`;
let gradient = (f,t,n)=>[...Array(++n+1)].map((_,i)=>f.replace(/../g,(e,j)=>((`0x${e}`*(n-i)+`0x${t[j]+t[j+1]}`*i)/n|256).toString(16).slice(1)))
// https://codegolf.stackexchange.com/a/92625


function parse_time(str) {

    str = str.substring(2, str.length);

    let t = [(str.match(/([^H]*)H/) || ['0'])[0],
        (str.match(/([0-9]*)M/) || ['0'])[0],
        (str.match(/([0-9\.]*)S/) || ['0'])[0]
    ].map(x => +x.replace(/[HMS]/g, ''));
    let s = t.pop();
    if (('' + s).includes(".")) {
        s = ('' + s).split(".");
        s[1] = (s[1] + '000').substring(0, 3);
        s = s.join(".");
        s = ('000000' + s).slice(-6);

    } else s = ('0' + s).slice(-2);

    t = t.map(x => ('0' + x).slice(-2));

    let time_str = `${t.join(":")}:${s}`;

    while (time_str.startsWith(":") || time_str.startsWith("0")) time_str = time_str.substring(1, time_str.length);
    return time_str;
}

async function get_game(game) {
    let url = `https://www.speedrun.com/api/v1/games/${game.trim()}/levels?embed=variables`;
    let response = await fetch(url, {cache: "no-cache"});
    log(loading + " Fetching " + url.split("speedrun.com")[1]);
    let id = response.url.split("/")[6];
    let json = await response.json();
    let levels = {};
    let variables = {};
    log(loading + " Parsing /games response");
    if(json.status == 404) return log("! Request yielded no data, are you sure you put in the correct id?")
    json.data.forEach(l => levels[l.id] = {
        name: l.name,
        variables: (_ => {
            let vars = {};
            l.variables.data.forEach(v => {
                vars[v.id] = v.name
                variables = {
                    ...variables,
                    ...v.values.choices
                }
            });
            return vars;
        })()
    });
    url = `https://www.speedrun.com/api/v1/games/${game.trim()}/categories?embed=variables`;
    response = await fetch(url, {cache: "no-cache"});
    log(loading + " Fetching " + url.split("speedrun.com")[1]);
    json = await response.json();
    json.data.forEach(c => c.variables.data.forEach(v => variables = {
        ...variables,
        ...v.values.choices
    }))
    return {
        id,
        levels,
        variables
    };

}
let runs_raw = [];
async function get_runs_raw(gameid, url) {
    //3dxkx0g1 = stray, mc = j1npme6p

    if (!url) url = `https://www.speedrun.com/api/v1/runs?game=${gameid}&status=new&max=200&embed=category,players,levels`;
    log(loading + " Fetching " + url.split("speedrun.com")[1]);
    let response = await fetch(url, {cache: "no-cache"});

    let json = await response.json();
    for (let run of json.data) runs_raw.push(run);
    if (json.pagination.links.find(l => l.rel == "next") && runs_raw.length < 999) return get_runs_raw(gameid, json.pagination.links.find(l => l.rel == "next").uri);
    return runs_raw;
}
async function parse_runs(game) {
    let game_data = await get_game(game);
    if(typeof game_data == "string") return 1;
    let runs = await get_runs_raw(game_data.id);
    log(loading + " Parsing runs");
    let parsed_runs = runs.map(r => ({
        condition: "ok",
        link: r.weblink,
        time: {
            string: parse_time(r.times.primary),
            number: r.times.primary_t
        },
        category: {
            name: r.category.data.name,
            il: r.category.data.type == 'per-level' ? game_data.levels[r.level].name : null
        },
        date: new Date(r.submitted),
        runners: r.players.data.map(p => p.rel == "user" ? {
            nationality: p.location ? p.location.country.code.replace("/","-") : null,
            name: p.names ? p.names.international : "NAME_ERROR",
            colors: p.names ? (p['name-style'].style == "solid" ? [
                p['name-style'].color.dark,
                p['name-style'].color.dark
            ] : Object.values(p['name-style']).filter((_, i) => i > 0).map(t => t.dark))
                .map(c => c.replace(/^\#/, "")) : ["#ffffff", "#ffffff"]
        } : {
            nationality: null,
            name: p.name,
            guest: true,
            colors: ["#FFFFFF", "#FFFFFF"]
        }),
        values: Object.values(r.values).map(v => game_data.variables[v])
    }));
    // Check for obsoletes
    parsed_runs = parsed_runs.map((r, index) => {
        
        for (let i in parsed_runs) {
            let run = parsed_runs[i];
           if( 
                r.runners.map(p => p.name).join('') == run.runners.map(p => p.name).join('') &&
                r.category.name == run.category.name &&
                r.values.join('') == run.values.join('') &&
                i != index
            ) {
                if (r.time.number == run.time.number) r.condition = "duplicate"
                else if (run.time.number < r.time.number && run.date > r.date) r.condition = "obsolete"
            }
        }
        return r;
    }).sort((a,b) => a.time.number - b.time.number).sort((a,b)=>a.runners[0].name.localeCompare(b.runners[0].name))
    return parsed_runs;
}
function player_name(player) {
    let grad = gradient(player.colors[0], player.colors[1], player.name.length - 2);
    let chars = [...player.name].map((c,i) => {
        let color = i == 0 ? player.colors[0] : i == player.name.length - 1 ? player.colors[1] : grad[i + 1];
        return `<span style="color:#${color};${player.guest ? "font-style:italic" : ''}">${c}</span>`
    });
    // fix for québec
    return `<span class="name">${player.nationality ? `<img src="${player.nationality == "ca-qc" ? "qc.png" : `https://flagcdn.com/256x192/${player.nationality}.png`}" style="display:inline;height:0.8em;" /> ` : ''}${chars.join("")}</span>`
}


async function main(game) {
    
    let runs = await parse_runs(game);
    if(runs == 1) return 1;
    (async _ => {
        let response = await fetch(`https://www.speedrun.com/api/v1/games/${game}`);
        let json = await response.json();
        let bg = document.querySelector(".bg");
        let bg_uri = json.data.assets.background.uri;
        let loader = new Image();
        loader.src = bg_uri;
        loader.onload = _ => {
            bg.src = bg_uri;
            bg.classList.add("fadein");
        }
        bg.onanimationend = _ => bg.classList.remove("fadein");
    })();
    for(let i of runs) {
        document.querySelector(".container_inner").innerHTML += `<div class="run" style="visibility:hidden;color:${
            i.condition == "duplicate" ? "#fd6" : i.condition == "obsolete" ? "#f77" : "#fff"
        }">${
            i.category.il ? "[IL] " : ''
        }${
            i.category.il ? i.category.il + ", " : ''
        }${
            i.category.name
        } in <a class="time" href="${
            i.link
        }">${
            i.time.string
        }</a> by ${
            i.runners.map(r => player_name(r)).join(", ")
        } ${
            i.values.length > 0 ? `[${i.values.join(", ")}]` : ''
        }<br>`;
        
    }
    let has_dupes = runs.map(x=>x.condition).includes("duplicate");
    let has_obsoletes = runs.map(x=>x.condition).includes("obsolete");
    document.querySelector(".container_header").innerHTML = `${
        has_obsoletes ? "<span style='color:#f77'>Obsoletes</span>" : ''
    }${
        has_obsoletes && has_dupes ? ", " : ""
    }${
        has_dupes ? "<span style='color:#fd6'>Duplicates</span>" : ''
    }`
    let run_elements = document.querySelectorAll(".run");
    let i = 0;
    let interval = setInterval(_=> {
        log(`Displaying run ${i+1}/${run_elements.length}${runs_raw.length > 999 ? ' (+)' : ''}`)
        run_elements[i].classList.add("run_fadein");
        run_elements[i].style.visibility = "visible"
        i++;
        if(i == run_elements.length) clearInterval(interval);
    }, 5);
}

function enter(e) {
    if(e && event.key != "Enter") return; 
    runs_raw = [];
    [...document.querySelectorAll(".container_inner > div")].map(x=>x.innerHTML = x.outerHTML = '');
    let {value} = document.querySelector("input");
    if(value.trim() == "") return;
    else {
        main(value);
    }
    
}
let load_int = 0;
window.onload = _ => setInterval(_ => {
    load_int = (load_int + 1)%4;
    [...document.querySelectorAll(".loading")].map(e => e.innerText = '|/-\\'[load_int]); // :)
}, 100);
