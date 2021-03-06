/* ------------------------------------------------ *
 * The MIT License (MIT)
 * Copyright (c) 2020 terryky1220@gmail.com
 * ------------------------------------------------ */
//tf.setBackend('wasm').then(() => startWebGL());

let s_debug_log;
let s_rtarget_main;
let s_rtarget_feed;
let s_rtarget_src;

function init_stats ()
{
    var stats = new Stats();
    var xPanel = stats.addPanel( new Stats.Panel( 'x', '#ff8', '#221' ) );
    var yPanel = stats.addPanel( new Stats.Panel( 'y', '#f8f', '#212' ) );
    stats.showPanel( 0 );
    document.body.appendChild( stats.dom );

    return stats;
}


function generate_input_image (gl, texid, win_w, win_h)
{
    let dims = get_pose_detect_input_dims ();
    let buf_rgba = new Uint8Array (dims.w * dims.h * 4);
    let buf_rgb  = new Uint8Array (dims.w * dims.h * 3);


    GLUtil.set_render_target (gl, s_rtarget_feed);
    gl.clear (gl.COLOR_BUFFER_BIT);
    r2d.draw_2d_texture (gl, texid, 0, win_h - dims.h, dims.w, dims.h, 1);

    gl.readPixels (0, 0, dims.w, dims.h, gl.RGBA, gl.UNSIGNED_BYTE, buf_rgba);
    for (let i = 0, j = 0; i < buf_rgba.length; i ++)
    {
        if (i % 4 != 3)
            buf_rgb[j++] = buf_rgba[i];
    }

    GLUtil.set_render_target (gl, s_rtarget_main);

    return buf_rgb;
}

function
generate_landmark_input_image (gl, srctex, texw, texh, detection, pose_id)
{
    let dims = get_pose_landmark_input_dims ();
    let buf_rgba = new Uint8Array (dims.w * dims.h * 4);
    let buf_rgb  = new Uint8Array (dims.w * dims.h * 3);

    let texcoord = [];

    if (detection.length > pose_id)
    {
        region = detection[pose_id];
        let x0 = region.roi_coord[0].x;
        let y0 = region.roi_coord[0].y;
        let x1 = region.roi_coord[1].x; //    0--------1
        let y1 = region.roi_coord[1].y; //    |        |
        let x2 = region.roi_coord[2].x; //    |        |
        let y2 = region.roi_coord[2].y; //    3--------2
        let x3 = region.roi_coord[3].x;
        let y3 = region.roi_coord[3].y;
        texcoord[0] = x3;   texcoord[1] = y3;
        texcoord[2] = x0;   texcoord[3] = y0;
        texcoord[4] = x2;   texcoord[5] = y2;
        texcoord[6] = x1;   texcoord[7] = y1;
    }

    GLUtil.set_render_target (gl, s_rtarget_feed);
    gl.clear (gl.COLOR_BUFFER_BIT);

    r2d.draw_2d_texture_texcoord_rot (gl, srctex, 0, texh - dims.h, dims.w, dims.h, texcoord, 0, 0, 0);

    gl.readPixels (0, 0, dims.w, dims.h, gl.RGBA, gl.UNSIGNED_BYTE, buf_rgba);
    for (let i = 0, j = 0; i < buf_rgba.length; i ++)
    {
        if (i % 4 != 3)
            buf_rgb[j++] = buf_rgba[i];
    }

    GLUtil.set_render_target (gl, s_rtarget_main);

    return buf_rgb;
}


function
render_detect_region (gl, ofstx, ofsty, texw, texh, detection)
{
    let col_white = [1.0, 1.0, 1.0, 1.0];
    let col_red   = [1.0, 0.0, 0.0, 1.0];
    let col_frame = [1.0, 0.0, 0.0, 1.0];

    for (let i = 0; i < detection.length; i ++)
    {
        region = detection[i];
        let x1 = region.topleft.x  * texw + ofstx;
        let y1 = region.topleft.y  * texh + ofsty;
        let x2 = region.btmright.x * texw + ofstx;
        let y2 = region.btmright.y * texh + ofsty;
        let score = region.score;

        /* rectangle region */
        r2d.draw_2d_rect (gl, x1, y1, x2-x1, y2-y1, col_frame, 2.0);

        /* class name */
        let buf = "" + (score * 100).toFixed(0);
        dbgstr.draw_dbgstr_ex (gl, buf, x1, y1, 1.0, col_white, col_frame);

        /* key points */
        let hx = region.keys[kMidHipCenter]     .x * texw + ofstx;
        let hy = region.keys[kMidHipCenter]     .y * texh + ofsty;
        let sx = (region.topleft.x + region.btmright.x) * 0.5;
        let sy = (region.topleft.y + region.btmright.y) * 0.5;
        sx = sx * texw + ofstx;
        sy = sy * texh + ofsty;

        r2d.draw_2d_line (gl, hx, hy, sx, sy, col_white, 2.0);
        let r = 4;
        r2d.draw_2d_fillrect (gl, hx - (r/2), hy - (r/2), r, r, col_frame);
        r2d.draw_2d_fillrect (gl, sx - (r/2), sy - (r/2), r, r, col_frame);

        for (let j0 = 0; j0 < 4; j0 ++)
        {
            let j1 = (j0 + 1) % 4;
            let x1 = region.roi_coord[j0].x * texw + ofstx;
            let y1 = region.roi_coord[j0].y * texh + ofsty;
            let x2 = region.roi_coord[j1].x * texw + ofstx;
            let y2 = region.roi_coord[j1].y * texh + ofsty;

            r2d.draw_2d_line (gl, x1, y1, x2, y2, col_red, 2.0);
        }
        let cx =  region.roi_center.x * texw + ofstx;
        let cy =  region.roi_center.y * texh + ofsty;
        r = 10;
        r2d.draw_2d_fillrect (gl, cx - (r/2), cy - (r/2), r, r, col_red);
    }
}

function
transform_pose_landmark (transformed_pos, landmark, region)
{
    let scale_x = region.roi_size.x;
    let scale_y = region.roi_size.y;
    let pivot_x = region.roi_center.x;
    let pivot_y = region.roi_center.y;
    let rotation= region.rotation;

    let mat = new Array(16);
    matrix_identity (mat);
    matrix_translate (mat, pivot_x, pivot_y, 0);
    matrix_rotate (mat, RAD_TO_DEG(rotation), 0, 0, 1);
    matrix_scale (mat, scale_x, scale_y, 1.0);
    matrix_translate (mat, -0.5, -0.5, 0);

    for (let i = 0; i < POSE_JOINT_NUM; i ++)
    {
        let vec = [landmark.joint[i].x, landmark.joint[i].y];
        matrix_multvec2 (mat, vec, vec);

        transformed_pos[i] = {x: vec[0], y:vec[1]};
    }
}

function
render_bone (gl, ofstx, ofsty, drw_w, drw_h,
             transformed_pos, id0, id1, col)
{
    let x0 = transformed_pos[id0].x * drw_w + ofstx;
    let y0 = transformed_pos[id0].y * drw_h + ofsty;
    let x1 = transformed_pos[id1].x * drw_w + ofstx;
    let y1 = transformed_pos[id1].y * drw_h + ofsty;

    r2d.draw_2d_line (gl, x0, y0, x1, y1, col, 5.0);
}

function
render_pose_landmark (gl, ofstx, ofsty, texw, texh, landmakr_ret,
                      detection, pose_id)
{
    let col_red    = [1.0, 0.0, 0.0, 1.0];
    let col_orange = [1.0, 0.6, 0.0, 1.0];
    let col_cyan   = [0.0, 1.0, 1.0, 1.0];
    let col_lime   = [0.0, 1.0, 0.3, 1.0];
    let col_pink   = [1.0, 0.0, 1.0, 1.0];
    let col_blue   = [0.0, 0.5, 1.0, 1.0];
    let col_white  = [1.0, 1.0, 1.0, 1.0];

    if (landmakr_ret.length <= pose_id)
        return;

    let landmark = landmakr_ret[pose_id];

    let score = landmark.score;
    let buf = "score:" + (score * 100).toFixed(1);
    dbgstr.draw_dbgstr_ex (gl, buf, texw - 120, 0, 1.0, col_white, col_red);

    let transformed_pos = new Array(POSE_JOINT_NUM);
    transform_pose_landmark (transformed_pos, landmark, detection[pose_id]);

    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 11, 12, col_cyan);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 12, 24, col_cyan);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 24, 23, col_cyan);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 23, 11, col_cyan);

    /* right arm */
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 11, 13, col_orange);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 13, 15, col_orange);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 15, 21, col_orange);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 15, 19, col_orange);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 15, 17, col_orange);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 17, 19, col_orange);

    /* left arm */
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 12, 14, col_lime);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 14, 16, col_lime);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 16, 22, col_lime);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 16, 20, col_lime);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 16, 18, col_lime);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 18, 20, col_lime);

    /* face */
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos,  9, 10, col_blue);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos,  0,  1, col_blue);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos,  1,  2, col_blue);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos,  2,  3, col_blue);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos,  3,  7, col_blue);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos,  0,  4, col_blue);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos,  4,  5, col_blue);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos,  5,  6, col_blue);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos,  6,  8, col_blue);

    /* right leg */
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 23, 25, col_pink);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 25, 27, col_pink);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 27, 31, col_pink);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 31, 29, col_pink);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 29, 27, col_pink);

    /* left leg */
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 24, 26, col_blue);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 26, 28, col_blue);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 28, 32, col_blue);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 32, 30, col_blue);
    render_bone (gl, ofstx, ofsty, texw, texh, transformed_pos, 30, 28, col_blue);

    for (let i = 0; i < POSE_JOINT_NUM; i ++)
    {
        let x = transformed_pos[i].x * texw + ofstx;
        let y = transformed_pos[i].y * texh + ofsty;

        let r = 9;
        r2d.draw_2d_fillrect (gl, x - (r/2), y - (r/2), r, r, col_red);
    }
}


function
render_cropped_pose_image (gl, srctex, ofstx, ofsty, texw, texh, detection, pose_id)
{
    let texcoord = [];

    if (detection.length <= pose_id)
        return;

    region = detection[pose_id];
    let x0 = region.roi_coord[0].x;
    let y0 = region.roi_coord[0].y;
    let x1 = region.roi_coord[1].x; //    0--------1
    let y1 = region.roi_coord[1].y; //    |        |
    let x2 = region.roi_coord[2].x; //    |        |
    let y2 = region.roi_coord[2].y; //    3--------2
    let x3 = region.roi_coord[3].x;
    let y3 = region.roi_coord[3].y;
    texcoord[0] = x0;   texcoord[1] = y0;
    texcoord[2] = x3;   texcoord[3] = y3;
    texcoord[4] = x1;   texcoord[5] = y1;
    texcoord[6] = x2;   texcoord[7] = y2;

    r2d.draw_2d_texture_texcoord_rot (gl, srctex, ofstx, ofsty, texw, texh, texcoord, 0, 0, 0);
}


/* Adjust the texture size to fit the window size
 *
 *                      Portrait
 *     Landscape        +------+
 *     +-+------+-+     +------+
 *     | |      | |     |      |
 *     | |      | |     |      |
 *     +-+------+-+     +------+
 *                      +------+
 */
function
generate_squared_src_image (gl, texid, src_w, src_h, win_w, win_h)
{
    let win_aspect = win_w / win_h;
    let tex_aspect = src_w / src_h;
    let scale;
    let scaled_w, scaled_h;
    let offset_x, offset_y;

    if (win_aspect > tex_aspect)
    {
        scale = win_h / src_h;
        scaled_w = scale * src_w;
        scaled_h = scale * src_h;
        offset_x = (win_w - scaled_w) * 0.5;
        offset_y = 0;
    }
    else
    {
        scale = win_w / src_w;
        scaled_w = scale * src_w;
        scaled_h = scale * src_h;
        offset_x = 0;
        offset_y = (win_h - scaled_h) * 0.5;
    }

    GLUtil.set_render_target (gl, s_rtarget_src);
    gl.clearColor (0.0, 0.0, 0.0, 1.0);
    gl.clear (gl.COLOR_BUFFER_BIT);
    r2d.draw_2d_texture (gl, texid, offset_x, offset_y, scaled_w, scaled_h, 1)
}


/* ---------------------------------------------------------------- *
 *      M A I N    F U N C T I O N
 * ---------------------------------------------------------------- */
async function startWebGL()
{
    s_debug_log = document.getElementById('debug_log');

    const canvas = document.querySelector('#glcanvas');
    const gl = canvas.getContext('webgl');
    if (!gl)
    {
        alert('Failed to initialize WebGL.');
        return;
    }

    gl.clearColor (0.7, 0.7, 0.7, 1.0);
    gl.clear (gl.COLOR_BUFFER_BIT);

    const camtex = GLUtil.create_camera_texture (gl);
    //const camtex = GLUtil.create_video_texture (gl, "pexels_dance.mp4");
    const imgtex = GLUtil.create_image_texture2 (gl, "pexels.jpg");

    let win_w = canvas.clientWidth;
    let win_h = canvas.clientHeight;

    r2d.init_2d_render (gl, win_w, win_h);
    init_dbgstr (gl, win_w, win_h);
    pmeter.init_pmeter (gl, win_w, win_h, win_h - 40);
    const stats = init_stats ();


    await init_tfjs_blazepose ();
    s_debug_log.innerHTML = "tfjs.Backend = " + tf.getBackend() + "<br>"

    s_rtarget_main = GLUtil.create_render_target (gl, win_w, win_h, 0);
    s_rtarget_feed = GLUtil.create_render_target (gl, win_w, win_w, 1);
    s_rtarget_src  = GLUtil.create_render_target (gl, win_w, win_w, 1);

    /* stop loading spinner */
    const spinner = document.getElementById('loading');
    spinner.classList.add('loaded');

    let prev_time_ms = performance.now();
    async function render (now)
    {
        pmeter.reset_lap (0);
        pmeter.set_lap (0);

        let cur_time_ms = performance.now();
        let interval_ms = cur_time_ms - prev_time_ms;
        prev_time_ms = cur_time_ms;

        stats.begin();

        let src_w = imgtex.image.width;
        let src_h = imgtex.image.height;
        let texid = imgtex.texid;
        if (GLUtil.is_camera_ready(camtex))
        {
            GLUtil.update_camera_texture (gl, camtex);
            src_w = camtex.video.videoWidth;
            src_h = camtex.video.videoHeight;
            texid = camtex.texid;
        }

        generate_squared_src_image (gl, texid, src_w, src_h, win_w, win_h);
        texid = s_rtarget_src.texid;

        /* --------------------------------------- *
         *  invoke TF.js (Pose detection)
         * --------------------------------------- */
        let feed_image = generate_input_image (gl, texid, win_w, win_h);

        let time_invoke0_start = performance.now();
        let predictions = await invoke_pose_detect (feed_image);
        let time_invoke0 = performance.now() - time_invoke0_start;

        /* --------------------------------------- *
         *  invoke TF.js (Pose landmark)
         * --------------------------------------- */
        let landmark_ret = [];
		let time_invoke1 = 0;
        for (let pose_id = 0; pose_id < predictions.length; pose_id ++)
        {
            let feed_image = generate_landmark_input_image (gl, texid, win_w, win_h, predictions, pose_id);

            let time_invoke1_start = performance.now();
            landmark_ret[pose_id] = await invoke_pose_landmark (feed_image);
            time_invoke1 += performance.now() - time_invoke1_start;
        }


        /* --------------------------------------- *
         *  render scene
         * --------------------------------------- */
        GLUtil.set_render_target (gl, s_rtarget_main);
        gl.clear (gl.COLOR_BUFFER_BIT);

        r2d.draw_2d_texture (gl, texid, 0, 0, win_w, win_h, 0)
        render_detect_region (gl, 0, 0, win_w, win_h, predictions);

        for (let pose_id = 0; pose_id < predictions.length; pose_id ++)
        {
            render_pose_landmark (gl, 0, 0, win_w, win_h, landmark_ret, predictions, pose_id);
        }

        /* draw cropped image of the pose area */
        for (let pose_id = 0; pose_id < predictions.length; pose_id ++)
        {
            let w = 100;
            let h = 100;
            let x = win_w - w - 10;
            let y = h * pose_id + 20;
            let col_white = [1.0, 1.0, 1.0, 1.0];

            render_cropped_pose_image (gl, texid, x, y, w, h, predictions, pose_id);
            r2d.draw_2d_rect (gl, x, y, w, h, col_white, 2.0);
        }

        /* --------------------------------------- *
         *  post process
         * --------------------------------------- */
        pmeter.draw_pmeter (gl, 0, 40);

        let str = "Interval: " + interval_ms.toFixed(1) + " [ms]";
        dbgstr.draw_dbgstr (gl, str, 10, 10);

        str = "TF.js0  : " + time_invoke0.toFixed(1)  + " [ms]";
        dbgstr.draw_dbgstr (gl, str, 10, 10 + 22 * 1);
        str = "TF.js1  : " + time_invoke1.toFixed(1)  + " [ms]";
        dbgstr.draw_dbgstr (gl, str, 10, 10 + 22 * 2);

        stats.end();
        requestAnimationFrame (render);
    }
    render ();
}
