let allData = []
let selectedState = 'CA'
let currentMetric = 'TMAX'
let barXScale, barYScale, lineXScale, lineYScale, zoomTransform

const t = 600

const METRICS = {
    TMAX: { label: 'Max Temp',   unit: '°F'  },
    TMIN: { label: 'Min Temp',   unit: '°F'  },
    TAVG: { label: 'Avg Temp',   unit: '°F'  },
    PRCP: { label: 'Precip.',    unit: 'in'  },
    SNOW: { label: 'Snowfall',   unit: 'in'  },
    AWND: { label: 'Wind Speed', unit: 'mph' },
}

const REGIONS = {
  AL: 'South', AR: 'South', DE: 'South', FL: 'South', GA: 'South', 
  KY: 'South', LA: 'South', MD: 'South', MS: 'South', NC: 'South', 
  OK: 'South', SC: 'South', TN: 'South', TX: 'South', VA: 'South', WV: 'South',

  IA: 'Midwest', IL: 'Midwest', IN: 'Midwest', KS: 'Midwest', MI: 'Midwest', MN: 'Midwest',
  MO: 'Midwest', ND: 'Midwest', NE: 'Midwest', OH: 'Midwest', SD: 'Midwest', WI: 'Midwest',

  CT: 'Northeast', MA: 'Northeast', ME: 'Northeast', NH: 'Northeast', 
  NJ: 'Northeast', NY: 'Northeast', PA: 'Northeast', RI: 'Northeast', VT: 'Northeast',

  AK: 'West', AZ: 'West', CA: 'West', CO: 'West', HI: 'West', 
  ID: 'West', MT: 'West', NV: 'West', NM: 'West', OR: 'West', 
  UT: 'West', WA: 'West', WY: 'West',

  GU: 'Territory', MP: 'Territory', PR: 'Territory', VI: 'Territory',

  AB: 'Canada', BC: 'Canada', MB: 'Canada', NB: 'Canada', NL: 'Canada', 
  NS: 'Canada', NT: 'Canada', ON: 'Canada', PE: 'Canada', QC: 'Canada'
};

const regions = ['West', 'Midwest', 'South', 'Northeast', 'Territory', 'Canada'];
const colorScale = d3.scaleOrdinal(regions, ['#f97316','#22d3ee','#a78bfa','#34d399','#fb7185', '#facc15'])

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const barMargin  = { top: 0, right: 60, bottom: 30, left: 42 }
const lineMargin = { top: 16, right: 20, bottom: 40, left: 52 }

let barSvg, barG, barW, barH
let lineSvg, lineG, lineW, lineH, lineZoom

function showTooltip(html, event) {
    d3.select('#tooltip')
        .style('display', 'block')
        .html(html)
        .style('left', (event.clientX + 16) + 'px')
        .style('top',  (event.clientY - 10) + 'px')
}
function moveTooltip(event) {
    d3.select('#tooltip')
        .style('left', Math.min(event.clientX + 16, window.innerWidth - 220) + 'px')
        .style('top',  Math.min(event.clientY - 10, window.innerHeight - 120) + 'px')
}
function hideTooltip() {
    d3.select('#tooltip').style('display', 'none')
}

function parseWeatherDate(d) {
    const s = String(d)
    return new Date(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8))
}

function aggByState(metric) {
    const rolled = d3.rollup(
        allData.filter(d => d[metric] !== null),
        v => ({ mean: d3.mean(v, d => d[metric]), count: v.length }),
        d => d.state
    )
    return Array.from(rolled, ([state, val]) => ({
        state,
        value:  val.mean,
        count:  val.count,
        region: REGIONS[state],
    })).sort((a, b) => b.value - a.value)
}

function aggByStateMonth(metric) {
    const rolled = d3.rollup(
        allData.filter(d => d[metric] !== null),
        v => d3.mean(v, d => d[metric]),
        d => d.state,
        d => d.month
    )
    const result = {}
    rolled.forEach(function(monthMap, state) {
        result[state] = MONTHS.map(function(_, i) {
            return {
                month: i,
                value: monthMap.has(i) ? monthMap.get(i) : null,
            }
        })
    })
    return result
}


function init() {
    d3.text('data/actual_weather_data2.csv')
        .then(function(raw) {
            allData = d3.csvParse(raw, function(d) {
                const dateObj = parseWeatherDate(d.date)
                // if (d.state === 'DE') {
                //   console.log("hi")
                // }
                return {
                    station: d.station,
                    state:   d.state ? d.state.trim() : null,
                    lat:     +d.latitude,
                    lon:     +d.longitude,
                    date:    dateObj,
                    month:   dateObj.getMonth(),
                    TMAX:    d.TMAX !== '' ? +d.TMAX : null,
                    TMIN:    d.TMIN !== '' ? +d.TMIN : null,
                    TAVG:    d.TAVG !== '' ? +d.TAVG : null,
                    PRCP:    d.PRCP !== '' ? +d.PRCP : null,
                    SNOW:    d.SNOW !== '' ? +d.SNOW : null,
                    AWND:    d.AWND !== '' ? +d.AWND : null,
                }
            })
            setupSelector()
            updateAxes()
            updateVis()
            addLegend()
        })
}

function setupSelector() {
    d3.select('#metricSelect')
        .property('value', currentMetric)
        .on('change', function() {
            currentMetric  = d3.select(this).property('value')
            zoomTransform  = d3.zoomIdentity
            lineSvg.select('.zoom-rect').call(lineZoom.transform, d3.zoomIdentity)
            updateAxes()
            updateVis()
        })
}

function updateAxes() {
    d3.select('#barChart').selectAll('*').remove()

    const barRect = document.getElementById('barChart').getBoundingClientRect()
    barW = barRect.width  - barMargin.left - barMargin.right
    barH = barRect.height - barMargin.top  - barMargin.bottom
    // barW = 100
    // barH = 700

    barSvg = d3.select('#barChart').append('svg')
        .attr('width',  barRect.width)
        .attr('height', barRect.height)

    barG = barSvg.append('g')
        .attr('transform', `translate(${barMargin.left},${barMargin.top})`)

    barG.append('g').attr('class', 'axis x-axis')
        .attr('transform', `translate(0,${barH})`)
    barG.append('g').attr('class', 'axis y-axis')
    barG.append('g').attr('class', 'bars-group')
    barG.append('line').attr('class', 'avg-line')
    barG.append('text').attr('class', 'avg-label')

    d3.select('#lineChart').selectAll('*').remove()

    const lineRect = document.getElementById('lineChart').getBoundingClientRect()
    lineW = lineRect.width  - lineMargin.left - lineMargin.right
    lineH = lineRect.height - lineMargin.top  - lineMargin.bottom

    lineSvg = d3.select('#lineChart').append('svg')
        .attr('width',  lineRect.width)
        .attr('height', lineRect.height)

    lineSvg.append('defs').append('clipPath').attr('id', 'lineClip')
        .append('rect').attr('width', lineW).attr('height', lineH + 10).attr('y', -5)

    lineG = lineSvg.append('g')
        .attr('transform', `translate(${lineMargin.left},${lineMargin.top})`)

    lineG.append('g').attr('class', 'axis x-axis-line')
        .attr('transform', `translate(0,${lineH})`)
    lineG.append('g').attr('class', 'axis y-axis-line')
    lineG.append('g').attr('class', 'grid y-grid')
    lineG.append('g').attr('class', 'lines-group').attr('clip-path', 'url(#lineClip)')
    lineG.append('g').attr('class', 'dots-group').attr('clip-path', 'url(#lineClip)')

    lineG.append('text').attr('class', 'axis-label')
        .attr('x', lineW / 2)
        .attr('y', lineH + 36)
        .attr('text-anchor', 'middle')
        .text('Month')

    lineG.append('text').attr('class', 'axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('x', -lineH / 2)
        .attr('y', -44)
        .attr('text-anchor', 'middle')
        .attr('id', 'yAxisLabel')

    zoomTransform = d3.zoomIdentity
    lineZoom = d3.zoom()
        .scaleExtent([1, 6])
        .translateExtent([[0, 0], [lineW, lineH]])
        .extent([[0, 0], [lineW, lineH]])
        .on('zoom', function(event) {
            zoomTransform = event.transform
            updateVis(true)
        })

    // Invisible rect on top catches mouse events for zoom/pan
    lineSvg.append('rect')
        .attr('class', 'zoom-rect')
        .attr('width',  lineW)
        .attr('height', lineH)
        .attr('transform', `translate(${lineMargin.left},${lineMargin.top})`)
        .attr('fill', 'transparent')
        .call(lineZoom)
}

function updateVis(fast = false) {
    if (!barSvg || !lineSvg) return

    const meta    = METRICS[currentMetric]
    const barData = aggByState(currentMetric)
    const monthly = aggByStateMonth(currentMetric)
    const trans   = fast
        ? d3.transition().duration(0)
        : d3.transition().duration(t).ease(d3.easeCubicOut)

    barYScale = d3.scaleBand()
        .domain(barData.map(d => d.state))
        .range([0, barH])
        .padding(0.18)

    barXScale = d3.scaleLinear()
        .domain([0, d3.max(barData, d => d.value) * 1.05])
        .range([0, barW])

    const avg = d3.mean(barData, d => d.value)

    barG.select('.x-axis').transition(trans)
    .call(d3.axisBottom(barXScale).ticks(4)
        .tickFormat(v => {
            const formatter = meta.unit === 'in' ? d3.format('.2f') : d3.format('.0f');
            return `${formatter(v)}${meta.unit}`;
        }))
    barG.select('.y-axis').transition(trans)
        .call(d3.axisLeft(barYScale).tickSize(0).tickPadding(6))

    barG.select('.avg-line').transition(trans)
        .attr('x1', barXScale(avg)).attr('x2', barXScale(avg))
        .attr('y1', 0).attr('y2', barH)
    barG.select('.avg-label').transition(trans)
        .attr('x', barXScale(avg) + 4)
        .attr('y', 10)
        .text(`avg ${d3.format('.1f')(avg)}${meta.unit}`)

    barG.select('.bars-group').selectAll('.bar')
        .data(barData, d => d.state)
        .join(
            function(enter) {
                return enter.append('rect')
                    .attr('class', 'bar')
                    .attr('y',      d => barYScale(d.state))
                    .attr('height', barYScale.bandwidth())
                    .attr('x', 0)
                    .attr('width', 0)
                    .attr('rx', 2)
                    .style('fill', d => colorScale(d.region))
                    .attr('r', 0)
                    .on('click', function(event, d) {
                        selectedState = d.state
                        document.getElementById('selectedLabel').textContent = selectedState || 'none'
                        updateVis()
                    })
                    .on('mouseover', function(event, d) {
                        showTooltip(`
                            <strong>${d.state}</strong>
                            <div class="tip-row">${d.region}</div>
                            <div class="tip-row">${meta.label}: <span>${d3.format('.1f')(d.value)} ${meta.unit}</span></div>
                            <div class="tip-row">Observations: <span>${d.count}</span></div>
                        `, event)
                        d3.select(this)
                            .style('stroke', 'white')
                            .style('stroke-width', '1.5px')
                    })
                    .on('mousemove', moveTooltip)
                    .on('mouseout', function() {
                        hideTooltip()
                        d3.select(this).style('stroke-width', '0px')
                    })
                    .transition(trans)
                    .attr('width', d => barXScale(d.value))
            },
            function(update) {
                return update.transition(trans)
                    .attr('y',      d => barYScale(d.state))
                    .attr('height', barYScale.bandwidth())
                    .attr('width',  d => barXScale(d.value))
                    .style('fill',  d => colorScale(d.region))
            },
            function(exit) {
                return exit.transition(trans).attr('width', 0).remove()
            }
        )
        .classed('selected', d => d.state === selectedState)
        .classed('dimmed',   d => selectedState !== null && d.state !== selectedState)

    lineXScale = d3.scaleLinear().domain([0, 11]).range([0, lineW])

    const allVals = Object.values(monthly).flat()
        .filter(d => d.value !== null).map(d => d.value)
    lineYScale = d3.scaleLinear()
        .domain([d3.min(allVals) * 0.95, d3.max(allVals) * 1.05])
        .range([lineH, 0]).nice()

    const zx = zoomTransform
        ? zoomTransform.rescaleX(lineXScale)
        : lineXScale

    lineG.select('.x-axis-line').transition(trans)
        .call(d3.axisBottom(zx).ticks(12)
            .tickFormat(i => MONTHS[Math.round(i)] || ''))
    lineG.select('.y-axis-line').transition(trans)
    .call(d3.axisLeft(lineYScale).ticks(5)
        .tickFormat(v => {
            const format = meta.unit === 'in' ? d3.format('.1f') : d3.format('.0f');
            return `${format(v)}${meta.unit}`;
        }))
    lineG.select('.y-grid').transition(trans)
        .call(d3.axisLeft(lineYScale).ticks(5).tickSize(-lineW).tickFormat(''))

    document.getElementById('yAxisLabel').textContent = `${meta.label} (${meta.unit})`

    const lineGen = d3.line()
        .defined(d => d.value !== null)
        .x(d => zx(d.month))
        .y(d => lineYScale(d.value))
        .curve(d3.curveCatmullRom.alpha(0.5))

    const statesToDraw = selectedState
        ? [selectedState]
        : Object.keys(monthly).slice(0, 8)

    const lineData = statesToDraw
        .filter(s => monthly[s])
        .map(s => ({ state: s, points: monthly[s] }))

    lineG.select('.lines-group').selectAll('.line-path')
        .data(lineData, d => d.state)
        .join(
            function(enter) {
                return enter.append('path')
                    .attr('class', 'line-path')
                    .attr('d', d => lineGen(d.points))
                    .attr('stroke', d => colorScale(REGIONS[d.state]))
                    .attr('opacity', 0)
                    .transition(trans)
                    .attr('opacity', 1)
            },
            function(update) {
                return update.transition(trans)
                    .attr('d', d => lineGen(d.points))
                    .attr('stroke', d => colorScale(REGIONS[d.state]))
                    .attr('opacity', 1)
            },
            function(exit) {
                return exit.transition(trans).attr('opacity', 0).remove()
            }
        )

    const dotData = lineData.flatMap(d =>
        d.points.filter(p => p.value !== null).map(p => ({ ...p, state: d.state }))
    )

    lineG.select('.dots-group').selectAll('.dot')
        .data(dotData, d => `${d.state}-${d.month}`)
        .join(
            function(enter) {
                return enter.append('circle')
                    .attr('class', 'dot')
                    .attr('cx', d => zx(d.month))
                    .attr('cy', d => lineYScale(d.value))
                    .attr('r', 0)
                    .attr('fill',   d => colorScale(REGIONS[d.state]))
                    .attr('stroke', 'var(--bg)')
                    .attr('stroke-width', 1.5)
                    .on('mouseover', function(event, d) {
                        d3.select(this)
                            .attr('r', 7)
                            .style('stroke', 'white')
                            .style('stroke-width', '2px')
                        showTooltip(`
                            <strong>${d.state} — ${MONTHS[d.month]}</strong>
                            <div class="tip-row">${meta.label}: <span>${d3.format('.1f')(d.value)} ${meta.unit}</span></div>
                            <div class="tip-row">Region: <span>${REGIONS[d.state] || '—'}</span></div>
                        `, event)
                    })
                    .on('mousemove', moveTooltip)
                    .on('mouseout', function() {
                        d3.select(this)
                            .attr('r', 4)
                            .style('stroke-width', '1.5px')
                        hideTooltip()
                    })
                    .transition(trans)
                    .attr('r', 4)
            },
            function(update) {
                return update.transition(trans)
                    .attr('cx', d => zx(d.month))
                    .attr('cy', d => lineYScale(d.value))
                    .attr('r', 4)
            },
            function(exit) {
                return exit.transition(trans).attr('r', 0).remove()
            }
        )

    document.getElementById('lineSubtitle').textContent = selectedState
        ? `Monthly averages · ${selectedState} · ${REGIONS[selectedState] || ''} · ${meta.label}`
        : `Monthly averages · all states (first 8) · ${meta.label}`
}

function addLegend() {
    const container = document.getElementById('legendContainer')
    container.innerHTML = ''
    regions.forEach(function(region) {
        container.innerHTML += `
            <div class="legend-item">
                <div class="legend-swatch" style="background:${colorScale(region)}"></div>
                ${region}
            </div>`
    })
    container.innerHTML += `
        <div class="legend-item" style="margin-left:auto">
            <svg width="24" height="12">
                <line x1="0" y1="6" x2="24" y2="6" stroke="#f0b429" stroke-dasharray="4 3" stroke-width="1.5"/>
            </svg>
            National Average
        </div>`
}

window.addEventListener('load', init)