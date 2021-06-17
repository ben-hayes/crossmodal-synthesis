import React, { useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import h337 from "heatmap.js";

function XyCanvas(props) {
  const canvasRef = useRef(null);
  const { draw, ...canvasProps } = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    draw(context);
  }, [draw]);

  return <canvas ref={canvasRef} {...canvasProps} />;
}

class XyController extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      dragging: false,
      xPos: 0,
      yPos: 0,
    };

    this.heatmapRef = React.createRef();
    this.props.posChangeCallback(0, 0);
  }

  drawController(context, isHeatmap, xPos, yPos) {
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    if (!isHeatmap) {
      context.fillStyle = "#fffcf2";
      context.fillRect(0, 0, context.canvas.width, context.canvas.height);
    }
    context.fillStyle = "#252422";
    context.fillRect(xPos - 10, yPos - 10, 20, 20);
  }

  _getMouseCoords(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(
      Math.min(e.pageX - rect.left, this.props.width - 1e-4),
      1e-4
    );
    const y = Math.max(
      Math.min(e.pageY - rect.top, this.props.height - 1e-4),
      1e-4
    );
    return { x, y };
  }

  handleMouseDown(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const { x, y } = this._getMouseCoords(e);
    this.props.posChangeCallback(x, y);
    this.setState({
      xPos: x,
      yPos: y,
      dragging: true,
    });
    this.props.noteOnCallback();
  }

  handleMouseUp(e) {
    this.setState({ dragging: false });
    this.props.noteOffCallback();
  }

  handleMouseMove(e) {
    if (this.state.dragging) {
      const { x, y } = this._getMouseCoords(e);
      this.setState({ xPos: x, yPos: y });
      this.props.posChangeCallback(x, y);
    }
  }

  createHeatMap() {
    if (!this.heatmap) {
      this.heatmap = h337.create({
        backgroundColor: "#fffcf2",
        container: this.heatmapRef.current,
      });
    }
    this.heatmap.setData({
      max: 5,
      data: this.props.heatmapData,
    });
  }

  componentDidMount() {
    if (this.props.isHeatmap) {
      this.createHeatMap();
    }
  }

  componentDidUpdate() {
    if (this.props.isHeatmap) {
      this.createHeatMap();
    }
  }

  render() {
    return (
      <div className="xy-controller">
        <div
          className="xy-pad"
          style={{ width: this.props.width, height: this.props.height }}
        >
          <div className="heatmap" ref={this.heatmapRef}></div>
          <XyCanvas
            className="xy-canvas"
            width={this.props.width + "px"}
            height={this.props.height + "px"}
            draw={(context) => {
              this.drawController(
                context,
                this.props.isHeatmap,
                this.state.xPos,
                this.state.yPos
              );
            }}
            onMouseDown={(e) => {
              this.handleMouseDown(e);
            }}
            onMouseUp={(e) => {
              this.handleMouseUp(e);
            }}
            onMouseLeave={(e) => {
              // this.handleMouseUp(e);
            }}
            onMouseMove={(e) => {
              this.handleMouseMove(e);
            }}
          />
        </div>
      </div>
    );
  }
}

export default XyController;
