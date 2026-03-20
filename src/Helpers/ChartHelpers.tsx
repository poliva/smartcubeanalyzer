import { Card, CardText, Col, OverlayTrigger, Ratio, Tooltip } from "react-bootstrap";
import { ChartType } from "./Types";
import { DARK_AXIS_COLORS } from "./ChartColors";

export function createTooltip(description: string) {
    const tooltip = (
        <Tooltip id="tooltip">
            {description}
        </Tooltip>
    );
    return tooltip;
}

export function buildChartHtml(chart: JSX.Element, title: string, tooltip: string): JSX.Element {
    return (
        <Col key={title} className="col-12 col-md-6">
            <Card className="p-2 p-md-3 shadow-sm">
                <OverlayTrigger placement="top" overlay={createTooltip(tooltip)}>
                    <CardText className="text-center fw-bold">
                        {title} ⓘ
                    </CardText>
                </OverlayTrigger>
                <Ratio aspectRatio="4x3">
                    {chart}
                </Ratio>
            </Card>
        </Col>
    )
}

const darkScaleOptions = {
    grid: { color: DARK_AXIS_COLORS.grid },
    ticks: { color: DARK_AXIS_COLORS.label },
    title: { color: DARK_AXIS_COLORS.label },
};

function applyDarkScaleOptions(scales: Record<string, unknown>): void {
    if (!scales) return;
    for (const key of Object.keys(scales)) {
        const s = scales[key] as Record<string, unknown>;
        if (s && typeof s === 'object') {
            const existingGrid = (s.grid as Record<string, unknown>) || {};
            const existingTicks = (s.ticks as Record<string, unknown>) || {};
            const existingTitle = (s.title as Record<string, unknown>) || {};
            scales[key] = {
                ...s,
                grid: { ...existingGrid, ...darkScaleOptions.grid },
                ticks: { ...existingTicks, ...darkScaleOptions.ticks },
                title: { ...existingTitle, ...darkScaleOptions.title }
            };
        }
    }
}

export function createOptions(chartType: ChartType, xAxis: string, yAxis: string, useLogScale: boolean, isStacked: boolean = true, isDateChart: boolean = false, isDark: boolean = false) {
    let genericOptions: any = {
        maintainAspectRatio: false
    };

    let chartOptions: any = {};

    switch (chartType) {
        case ChartType.Line:
            chartOptions = {
                spanGaps: true,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: xAxis
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: yAxis
                        }
                    }
                }
            };

            if (isDateChart) {
                chartOptions.scales.x.type = 'timeseries';
                chartOptions.scales.x.timeseries = {
                    units: 'quarter',
                    displayFormats: {
                        quarter: 'MMM yyyy'
                    }
                };
            }

            if (useLogScale) {
                chartOptions.scales.y.type = 'logarithmic';
            }
            break;

        case ChartType.Bar:
            chartOptions = {
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: xAxis
                        },
                        stacked: isStacked,
                        ticks: {
                            autoSkip: true,
                            maxRotation: 45,
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: yAxis
                        },
                        stacked: isStacked
                    }
                }
            };

            if (useLogScale) {
                chartOptions.scales.y.type = 'logarithmic';
            }
            break;

        case ChartType.Doughnut:
            chartOptions = {
            }
            break;
        default:
            console.log("Unknown chart type: " + chartType)
    }

    if (isDark && chartOptions.scales) {
        applyDarkScaleOptions(chartOptions.scales);
    }

    return { ...chartOptions, ...genericOptions };
}