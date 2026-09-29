#![no_std]

use core::panic::PanicInfo;

#[panic_handler]
fn panic(_info: &PanicInfo) -> ! {
    loop {}
}

static mut BUFFER: [f32; 1024] = [0.0; 1024];

#[no_mangle]
pub extern "C" fn get_buffer_ptr() -> *mut f32 {
    unsafe { BUFFER.as_mut_ptr() }
}

#[no_mangle]
pub extern "C" fn get_buffer_len() -> usize {
    1024
}

#[no_mangle]
pub extern "C" fn detect_voice_rust(len: usize, threshold: f32) -> u32 {
    let count = if len > 1024 { 1024 } else { len };
    if count == 0 {
        return 0;
    }
    unsafe {
        let mut max_abs: f32 = 0.0;
        let mut sum_sq: f32 = 0.0;
        for i in 0..count {
            let val = BUFFER[i];
            let abs_val = if val < 0.0 { -val } else { val };
            if abs_val > max_abs {
                max_abs = abs_val;
            }
            sum_sq += val * val;
        }
        let rms = sum_sq / (count as f32);
        let thresh_sq = threshold * threshold;
        if max_abs >= threshold || rms >= thresh_sq {
            1
        } else {
            0
        }
    }
}
